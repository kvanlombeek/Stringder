
var strings_returned_from_backend;
var strings_in_frontend;
var pairs_returned_to_backend = [];
var backend_communication_loop_running = false;

var selection;
var active_pair_index;
var number_of_votes = 0;
var KPI_history = {}

var man_class_enabled = true
var first_time_history_graph = true
var feature_importances_global

// global variables for d3 graph
var	svg_width;
var	svg_height;
var	margin_right;
var	margin_left;
var	margin_top;
var	margin_bottom;

var width_of_div_sorting_strings = $('#div_sorting_strings').width();
width_of_div_sorting_strings = 806

// Hulp functies
function key(d){ return d['key'] }
function return_key(d){ return d[0] }

function initialize(){

	// Initialize, reset all the database manual predictions in backend to NULL
	initialize_backend()

	//Query the first strings and add them on screen
	query_two_strings(50)
	// As it is the first time, add them in the array strings on screen
	strings_in_frontend = strings_returned_from_backend;
	
	// Add the strings in the "to sort div"	
	selection = d3.select('#div_sorting_strings')
					.selectAll("span")
					.data(d3.entries(strings_in_frontend), key );

	selection.enter()
				.append('span')
				.text(function(d){
					return d['value']['dirty_street'] + " - " + d['value']['kad_street']
				})

	// Make the active one bigger
	active_pair_index = d3.keys(strings_in_frontend)[0]

	selection.style("font-weight", function(d){
					if(d['key']==active_pair_index){ return 'bold' }else{ return 'normal'}
				})
				.style("font-size", function(d){
					if(d['key']==active_pair_index){ return '100%' }else{ return '100%' }
				})
				.style("left", function(d,i){
					temp = d['value']['dirty_street'] + " - " + d['value']['kad_street']
					return width_of_div_sorting_strings / 2 - temp.length*7 / 2
				})
				.style("top", function(d,i){return i*30})
				.style("position", 'absolute')

	// Make the SVG for the feature graph
	feature_graph_svg = d3.select('#feature_importance_graph')
							.append('svg')
							.attr('width', '100%')
							.attr('height', '1200')

	svg_width = $('#feature_importance_graph').width()
	svg_height = $('#feature_importance_graph').height()
	margin_right = 25
	margin_left = 0
	margin_top = 25
	margin_bottom = 25

	// Make the SVG for the goodness of fit graph
	goodness_of_fit_graph_svg = d3.select('#goodness_of_fitnes_graph')
							.append('svg')
							.attr('id', 'goodness_of_fit_graph_svg')
							.attr('width', '100%')
							.attr('height', '100%')

	// Make the SVG for the training progress of fit graph
	goodness_of_fit_graph_svg = d3.select('#training_progress_graph')
							.append('svg')
							.attr('id', 'training_progress_graph_svg')
							.attr('width', '100%')
							.attr('height', '100%')						

}

function query_two_strings(how_many){
	$.ajax({
    	url: '/request_string_pair',
    	dataType:'json',
		data: {'how_many':how_many},
		async: false,
		success:function(strings){
			strings_returned_from_backend = strings
		}
	});
}

function initialize_backend(){
	$.ajax({
    	url: '/initialize',
    	dataType:'json',
    	async: false,
		data: {},
		success:function(){
			console.log('Backend initialized')
		}
	});
}

function predict_button(){

	if(number_of_votes < 20){
		alert('First manually classify 20 strings')
		return;
	}

	if(man_class_enabled){
		
		$('#predict_button').text('Continue training')
		selection.style("left", function(d,i){
			 		if(d['value']['rf_prediction'] == 'Yes'){
			 			// Align right
			 			return width_of_div_sorting_strings - 1 - $(this).width()
			 		}else{
			 			// Align left
			 			return 0
			 		}
				})		
		man_class_enabled = false
	}else{
		$('#predict_button').text('Check predictions')
		selection.style("left", function(d,i){
					temp = d['value']['dirty_street'] + " - " + d['value']['kad_street']
					if(d['value']['man_vote'] == null){
						// algin center
				 		return width_of_div_sorting_strings / 2 - temp.length*7 / 2
				 	}else{
				 		if(d['value']['man_vote'] == 'Yes'){
				 			// Align right
				 			return width_of_div_sorting_strings - 1 - $(this).width()
				 		}else{
				 			// Align left
				 			return 0
				 		}
				 	}
				})
		man_class_enabled = true
	}
}

function actions_after_vote(vote){

	// Actions to take:
	// - Return the vote to the backend
	// - Query a new pair of strings
	// - Query the random forest scores, feature importances, and model KPIs
	// - In the success functions of the AJAX calls are a call to update the graphs
	// - Add the new string pair to the list of strings

	// Parameter to keep track of votes
	number_of_votes = number_of_votes + 1;

	//First store vote
	strings_in_frontend[active_pair_index]['man_vote'] = vote

	// Delete the first votes on top of the page, DANGEROUS
	if(number_of_votes > 5){
		delete strings_in_frontend[d3.keys(strings_in_frontend)[0]]
	}

	// More than 10 votes, start building random forests in backend
	if(number_of_votes > 15){
		if(!backend_communication_loop_running){
			backend_communication_loop_running = true
			console.log('Start backend communication')
			backend_communication_loop()
			console.log('Does he continue?')
		}
	}
	
	// More than 20 votes, enable the predict 
	if(number_of_votes == 20){
		$('#predict_button').removeClass()
		$('#predict_button').addClass('waves-effect waves-light btn')
	}

	// Search for active pair
	var pair_not_found = true
	var i = 0;
	while (pair_not_found){
    	if(strings_in_frontend[d3.keys(strings_in_frontend)[i]]['man_vote'] == null){
    		active_pair_index = d3.keys(strings_in_frontend)[i]
    		pair_not_found = false
    	}
    	i++;
	}
	update_d3_string_pairs_table()
}

function backend_communication_loop(){
	console.log('begin communcation loop')
	
	// Return votes that were not yet returned, keep track of how many, this number has to be requested again
	var temp_how_many_returned = 0
	for(i=0; i < d3.entries(strings_in_frontend).length; i++){
		// Is the pair voted?
		if(d3.values(strings_in_frontend)[i]['man_vote'] != null){
			if(pairs_returned_to_backend.indexOf(d3.keys(strings_in_frontend)[i]) == -1){
				return_vote(d3.keys(strings_in_frontend)[i], d3.values(strings_in_frontend)[i]['man_vote'])
				pairs_returned_to_backend.push(d3.keys(strings_in_frontend)[i])
				temp_how_many_returned +=1
			}

		}
	}

	if(temp_how_many_returned == 0){
		backend_communication_loop_running = false
		//No reason to continue loop
		return;
	}

	// Request new strings
	console.log('How many new strings requested: ' + temp_how_many_returned)
	if(temp_how_many_returned > 0){
		query_two_strings(temp_how_many_returned)
		for(i=0; i<d3.entries(strings_returned_from_backend).length; i++){
			strings_in_frontend[d3.keys(strings_returned_from_backend)[i]] = strings_returned_from_backend[d3.keys(strings_returned_from_backend)[i]]		
		}
	}
	
	// Request random forest scores
	request_rf_backend()

	//setTimeout(backend_communication(), 50000);
}

function update_d3_string_pairs_table(){

	// Now update the DOM with d3
	selection = d3.select("#div_sorting_strings").selectAll("span")
					.data(d3.entries(strings_in_frontend), key);

	selection.enter()
				.append('span')
				.text(function(d){
					return d['value']['dirty_street'] + " - " + d['value']['kad_street']
				})
				.style("top", function(d,i){return d3.entries(strings_in_frontend).length*30})
				.style("left", function(d,i){
					temp = d['value']['dirty_street'] + " - " + d['value']['kad_street']
					return width_of_div_sorting_strings / 2 - temp.length*7 / 2
				});



	selection.style("font-weight", function(d){
					if(d['key']==active_pair_index){ return 'bold' }else{ return 'normal'}
				})
				.style("position", 'absolute')
				.style("font-size", function(d){
					if(d['key']==active_pair_index){ return '100%' }else{ return '100%' }
				})

	selection.exit()
				.remove()

	selection.transition()
				.style("top", function(d,i){return i*30})
				.style("left", function(d,i){
					temp = d['value']['dirty_street'] + " - " + d['value']['kad_street']
					if(d['value']['man_vote'] == null){
						// algin center
				 		return width_of_div_sorting_strings / 2 - temp.length*7 / 2
				 	}else{
				 		if(d['value']['man_vote'] == 'Yes'){
				 			// Align right
				 			return width_of_div_sorting_strings - 1 - $(this).width()
				 		}else{
				 			// Align left
				 			return 0
				 		}
				 	}
				})
}

// This function is recursive, when finished (and all results are returned from backend, it calls itself again
function request_rf_backend(){

	// Request backend to train random forests and join returning votes
	$.ajax({
    	url: '/query_rf_scores',
    	dataType:'json',
    	async: true,
		data: {},
		success:function(rf_scores){
			//Random forest joinen met reeds bestaande strings
			for(i=0; i<d3.keys(strings_in_frontend).length; i++){
				strings_in_frontend[d3.keys(strings_in_frontend)[i]]['rf_prediction'] = rf_scores[d3.keys(strings_in_frontend)[i]]['rf_prediction']
			}
			// Model KPIs and features importances opvragen
			request_feature_importances()
			request_model_KPIs()

			// Ask again for backend
			backend_communication_loop()
		}
	});
}
function request_feature_importances(){
	// Query the feature importances
	$.ajax({
		url: '/query_feature_importances',
		dataType:'json',
		async:false,
		data:{},
		success:function(feature_importances){
			if(number_of_votes>10){
				build_feature_imp_graph(feature_importances)
			}	
		}
	})

}
function request_model_KPIs(){
	// Query model KPIs
	$.ajax({
		url: '/query_model_KPIs',
		dataType:'json',
		async:false,
		data:{},
		success:function(model_KPIs){
			$('#span_KPI_number_of_votes').text(model_KPIs['number_of_votes'])
			$('#span_KPI_number_of_matches').text(model_KPIs['number_of_matches'])
			$('#span_KPI_number_of_non_matches').text(model_KPIs['number_of_non_matches'])
			
			if(number_of_votes > 10){
				KPI_history[number_of_votes] = {'precission': model_KPIs['precission'], 'recall': model_KPIs['recall']}
				$('#span_KPI_precission').text(model_KPIs['true_positives'] + "/(" + model_KPIs['true_positives'] +"+"+model_KPIs['false_positives'] + ")=" +
				  Math.round(model_KPIs['precission']*100) + "%")

				$('#span_KPI_recall').text(model_KPIs['true_positives'] + "/(" + model_KPIs['true_positives'] +"+"+model_KPIs['false_negatives'] + ")=" +
					Math.round(model_KPIs['recall']*100) + "%")
				$('#span_KPI_true_positives').text(Math.round(model_KPIs['true_positives']))
				$('#span_KPI_false_positives').text(Math.round(model_KPIs['false_positives']))
				$('#span_KPI_true_negatives').text(Math.round(model_KPIs['true_negatives']))	
				$('#span_KPI_false_negatives').text(Math.round(model_KPIs['false_negatives']))	
				$('#span_KPI_total_positives').text(Math.round(model_KPIs['true_positives'] + model_KPIs['false_positives']))	
				$('#span_KPI_total_negatives').text(Math.round(model_KPIs['true_negatives'] + model_KPIs['false_negatives']))

				build_goodness_of_fit_graph(model_KPIs)	
				build_KPI_history_graph(KPI_history)
			}
		}
	})
}

function return_vote(pair_index, vote){
	$.ajax({
    	url: '/return_vote',
    	dataType:'json',
    	async: false,
		data: {'pair_index':pair_index,
				'vote':vote},
		success:function(){
		}
	});
}

$(document).keydown(function(e) {
    switch(e.which) {
        case 37: // left
        if(man_class_enabled){
        	actions_after_vote('No')
        }
        break;

        case 39: // right
        if(man_class_enabled){
        	actions_after_vote('Yes')
        }
        break;

        default: return; // exit this handler for other keys
    }
    e.preventDefault(); // prevent the default action (scroll / move caret)
});


function build_KPI_history_graph(KPI_history){

	var margin_left = 30;
	var margin_right = 20;
	var margin_top = 20;
	var margin_bottom = 20;

	var svg = d3.select('#training_progress_graph_svg')
	var xscale = d3.scale.linear()
	 					.domain([10, number_of_votes])
	 					.range([0 + margin_left,$('#training_progress_graph_svg').width() - margin_right]);

	var yscale = d3.scale.linear()
	 					.domain([1, 0])
	 					.range([0 + margin_left,$('#training_progress_graph_svg').height() - margin_right]);

	// Define the axes
	var xAxis = d3.svg.axis().scale(xscale)
    	.orient("bottom")
    	.ticks(5);

	var yAxis = d3.svg.axis().scale(yscale)
    							.orient("left")
    							.ticks(5);

	var precission_line_generator = d3.svg.line()
    		.x(function(d) { 
    			return xscale(d['key']); 
    		})
    		.y(function(d) { 
    			return yscale(d['value']['precission']); 
    		});

   	var recall_line_generator = d3.svg.line()
    		.x(function(d) { 
    			return xscale(d['key']); 
    		})
    		.y(function(d) { 
    			return yscale(d['value']['recall']); 
    		});
	
	if(first_time_history_graph){

		// Add the X Axis
    	svg.append("g")
        	.attr("class", "x axis")
        	.attr("transform", "translate(0," + String($('#training_progress_graph_svg').height() - margin_right) + ")")
        	.call(xAxis);

    	// Add the Y Axis
    	svg.append("g")
        	.attr("class", "y axis")
        	.attr("transform", "translate(" + String(margin_left)+  ", 0)")
        	.call(yAxis);

        // Add precission line
    	svg.append("path")
        	.attr("class", "precission_line")
        	.attr("d", precission_line_generator(d3.entries(KPI_history)));
       	// Add recall line
    	svg.append("path")
        	.attr("class", "recall_line")
        	.attr("d", recall_line_generator(d3.entries(KPI_history)));

        // X axis label
        svg.append("text")
    		.attr("class", "x label")
		    .attr("text-anchor", "end")
		    .attr("x", $('#training_progress_graph_svg').width() - margin_right)
		    .attr("y", $('#training_progress_graph_svg').height() - margin_right - 6)
		    .text("Number of votes");

        first_time_history_graph = false
	
	}else{
		svg.select(".precission_line")   // change the line
            .transition()
            .duration(750)
            .attr("d", precission_line_generator(d3.entries(KPI_history)));

       	svg.select(".recall_line")   // change the line
            .transition()
            .duration(750)
            .attr("d", recall_line_generator(d3.entries(KPI_history)));

        svg.select(".x.axis") // change the x axis
            .transition()
            .duration(750)
            .call(xAxis);
        svg.select(".y.axis") // change the y axis
            .transition()
            .duration(750)
            .call(yAxis);
	}

	//training_progress_graph
	console.log(KPI_history)
	//training_progress_graph_svg
}

function build_goodness_of_fit_graph(model_KPIs){

	goodness_of_fit_KPIs = {}
	goodness_of_fit_KPIs['precission_TP'] = model_KPIs['true_positives']
	goodness_of_fit_KPIs['recall_TP'] = model_KPIs['true_positives']
	goodness_of_fit_KPIs['recall_FN'] = model_KPIs['false_negatives']
	goodness_of_fit_KPIs['precission_FP'] = model_KPIs['false_positives']

	var x_middle = $('#goodness_of_fitnes_graph').width()/2
	var y_middle = $('#goodness_of_fitnes_graph').height()/2
	var bar_height = $('#goodness_of_fitnes_graph').height()/4
	var margin_left_right = 40
	var margin_between_bars = 5

	var xscale = d3.scale.linear()
	 					.domain([0, number_of_votes/1.8])
	 					.range([0, $('#goodness_of_fitnes_graph').width() / 2  - margin_left_right*2]);

	vertical_axis = d3.select('#goodness_of_fit_graph_svg')
						.selectAll('line')
						.data([{'test':'test'}])
						.enter()
						.append('line')
						.attr('x1', x_middle)
						.attr('x2', x_middle)
						.attr('y1', y_middle - bar_height - 2*margin_between_bars)
						.attr('y2', y_middle + bar_height + 2*margin_between_bars)
						.attr('stroke', 'black')

	bars_selection = d3.select('#goodness_of_fit_graph_svg')
					.selectAll('rect')
					.data(d3.entries(goodness_of_fit_KPIs), key )

	bars_selection.enter()
						.append('rect')
						.attr('x', function(d){
							if(d['key'] == 'precission_TP') return x_middle - xscale(d['value'])
							if(d['key'] == 'recall_TP') return x_middle
							if(d['key'] == 'recall_FN') return x_middle
							if(d['key'] == 'precission_FP') return x_middle - xscale(d['value'])
						})
						.attr('y', function(d, i){
							if(d['key'] == 'precission_TP') return y_middle - bar_height - margin_between_bars
							if(d['key'] == 'recall_TP') return y_middle - bar_height - margin_between_bars
							if(d['key'] == 'recall_FN') return y_middle  + margin_between_bars
							if(d['key'] == 'precission_FP') return y_middle + margin_between_bars
							
						})
						.attr('height', function(d,i){
							return bar_height
						})
						.attr('width', function(d){
							if(d['key'] == 'precission_TP') return xscale(d['value'])
							if(d['key'] == 'recall_TP') return xscale(d['value'])
							if(d['key'] == 'recall_FN') return xscale(d['value'])
							if(d['key'] == 'precission_FP') return xscale(d['value'])
						})
						.attr('fill', function(d){
							return 'rgb(0,0,' +(d['value'] / number_of_votes * 255)+')';
						})
						.attr('stroke' ,'black');		

	bars_selection.transition()
						.duration(500)
						.attr('width', function(d){
							if(d['key'] == 'precission_TP') return xscale(d['value'])
							if(d['key'] == 'recall_TP') return xscale(d['value'])
							if(d['key'] == 'recall_FN') return xscale(d['value'])
							if(d['key'] == 'precission_FP') return xscale(d['value'])
							return 
						})
						.attr('x', function(d){
							if(d['key'] == 'precission_TP') return x_middle - xscale(d['value'])
							if(d['key'] == 'recall_TP') return x_middle
							if(d['key'] == 'recall_FN') return x_middle
							if(d['key'] == 'precission_FP') return x_middle - xscale(d['value'])
						})	
						.attr('fill', function(d){
							return 'rgb(0,0,' +(d['value'] * 2 / number_of_votes * 255)+')';
						})

	text_selection = d3.select('#goodness_of_fit_graph_svg')
						.selectAll('text')
						.data(d3.entries(goodness_of_fit_KPIs), key)	
						
	text_selection.enter()
					.append('text')
					.text(function(d){
						if(d['key'] == 'precission_TP') return String("TP: " + d['value'])
						if(d['key'] == 'recall_TP') return String("TP: " + d['value'])
						if(d['key'] == 'recall_FN') return String("FN: " + d['value'])
						if(d['key'] == 'precission_FP') return String("FP: " + d['value'])
					})
					.attr('y', function(d, i){
							if(d['key'] == 'precission_TP') return y_middle - bar_height/2 - margin_between_bars +3
							if(d['key'] == 'recall_TP') return y_middle - bar_height/2 - margin_between_bars +3
							if(d['key'] == 'recall_FN') return y_middle + bar_height/2  + margin_between_bars +3
							if(d['key'] == 'precission_FP') return y_middle + bar_height/2 + margin_between_bars +3
							
					})
					.attr('x', function(d){
							if(d['key'] == 'precission_TP') return x_middle -  xscale(d['value']) - 35 - String(d['value']).length * 7
							if(d['key'] == 'recall_TP') return x_middle + xscale(d['value']) +5
							if(d['key'] == 'recall_FN') return x_middle + xscale(d['value']) +5
							if(d['key'] == 'precission_FP') return x_middle - xscale(d['value']) - 35 - String(d['value']).length * 7
					})

	text_selection.transition()
					.duration(500)
					.attr('x', function(d){
							if(d['key'] == 'precission_TP') return x_middle -  xscale(d['value']) - 35 - String(d['value']).length * 7
							if(d['key'] == 'recall_TP') return x_middle + xscale(d['value']) +5
							if(d['key'] == 'recall_FN') return x_middle + xscale(d['value']) +5
							if(d['key'] == 'precission_FP') return x_middle - xscale(d['value']) - 35 - String(d['value']).length * 7
					})
					.text(function(d){
						if(d['key'] == 'precission_TP') return String("TP: " + d['value'])
						if(d['key'] == 'recall_TP') return String("TP: " + d['value'])
						if(d['key'] == 'recall_FN') return String("FN: " + d['value'])
						if(d['key'] == 'precission_FP') return String("FP: " + d['value'])
					})

	goodness_of_fit_KPIs = {}
	goodness_of_fit_KPIs['precission'] = model_KPIs['precission']
	goodness_of_fit_KPIs['recall'] = model_KPIs['recall']


	text_GF_selection = text_selection = d3.select('#goodness_of_fit_graph_svg')
						.selectAll('text')
						.data(d3.entries(goodness_of_fit_KPIs), key)

	text_GF_selection.enter()
					.append('text')
					.text(function(d){
						if(d['key'] == 'precission') return String("Precission: " + Math.round(d['value']*100) + "%")
						if(d['key'] == 'recall') return String("Recall: " + Math.round(d['value']*100) + "%")
					})
					.attr('y', function(d, i){
						return y_middle - bar_height - 10
					})
					.attr('x', function(d){
						if(d['key'] == 'precission') return x_middle - 110
						if(d['key'] == 'recall') return x_middle + 5
					})
	text_selection.transition()
					.duration(500)
					.text(function(d){
						if(d['key'] == 'precission') return String("Precission: " + Math.round(d['value']*100) + "%")
						if(d['key'] == 'recall') return String("Recall: " + Math.round(d['value']*100) + "%")
					})

}

function build_feature_imp_graph(feature_importances){

	feature_importances_global = feature_importances

	var feature_importances_global = [];
	for (i in d3.keys(feature_importances)){
		feature_importances_global.push([d3.keys(feature_importances)[i], feature_importances[d3.keys(feature_importances)[i]]]);
	} 
	feature_importances_global.sort(function(a, b) {
    	a = a[1];
    	b = b[1];
    	return a > b ? -1 : (a < b ? 1 : 0);
	});

	var yscale = d3.scale.ordinal()
	 					.domain(d3.range(feature_importances_global.length))
	 					.rangeBands([0, svg_height - margin_top - margin_bottom], 0.2)

	var xscale = d3.scale.linear()
	 					.domain([0,1])
	 					.range([0,svg_width - margin_right - margin_left]);

	rectangles_selection = feature_graph_svg.selectAll('rect')
						.data(feature_importances_global, return_key)

	rectangles_selection.enter()
						.append('rect')
						.attr('x', function(d){
							return 0 + margin_left
						})
						.attr('y', function(d, i){
							return yscale(i)
						})
						.attr('height', function(d,i){
							return yscale.rangeBand()
						})
						.attr('width', function(d){
							return xscale(feature_importances_global[1])
						})	

	rectangles_selection.transition()
						.duration(1000)
						.delay(function(d,i){
							return i / feature_importances_global.length * 1000
						})
						.attr('y', function(d, i){
							return yscale(i)
						})
						.attr('width', function(d){
							return xscale(d[1])
						})	
						.attr('fill', function(d){
							return 'rgb(0,0,' +(d[1]*255*5)+')';
						})			

	rectangles_selection.exit()
						.remove()

	labels_selection = feature_graph_svg.selectAll('text')
											.data(feature_importances_global, return_key)

	labels_selection.enter()
					.append('text')
					.text(function(d){
						return d[0]
					})
					.attr('x', function(d){
						return xscale(d[1])+5;
					})
					.attr('y', function(d,i){
						return yscale(i) + yscale.rangeBand()/2 +5
					})

	labels_selection.transition()
						.duration(1000)
						.delay(function(d,i){
							return i / feature_importances_global.length * 1000
						})
						.attr('x', function(d){
							return xscale(d[1])+5;
						})
						.text(function(d){
							return d[0]
						})
						.attr('y', function(d,i){
							return yscale(i) + yscale.rangeBand()/2 +5
						})

	labels_selection.exit()
					.remove()
}	

	// 	var grids = canvas.append('g')
	// 					  .attr('id','grid')
	// 					  .attr('transform','translate(150,10)')
	// 					  .selectAll('line')
	// 					  .data(grid)
	// 					  .enter()
	// 					  .append('line')
	// 					  .attr({'x1':function(d,i){ return i*30; },
	// 							 'y1':function(d){ return d.y1; },
	// 							 'x2':function(d,i){ return i*30; },
	// 							 'y2':function(d){ return d.y2; },
	// 						})
	// 					  .style({'stroke':'#adadad','stroke-width':'1px'});

	// 	var	xAxis = d3.svg.axis();
	// 		xAxis
	// 			.orient('bottom')
	// 			.scale(xscale)
	// 			.tickValues(tickVals);

	// 	var	yAxis = d3.svg.axis();
	// 		yAxis
	// 			.orient('left')
	// 			.scale(yscale)
	// 			.tickSize(2)
	// 			.tickFormat(function(d,i){ return categories[i]; })
	// 			.tickValues(d3.range(17));

	// 	var y_xis = canvas.append('g')
	// 					  .attr("transform", "translate(150,0)")
	// 					  .attr('id','yaxis')
	// 					  .call(yAxis);

	// 	var x_xis = canvas.append('g')
	// 					  .attr("transform", "translate(150,480)")
	// 					  .attr('id','xaxis')
	// 					  .call(xAxis);

	// 	var chart = canvas.append('g')
	// 						.attr("transform", "translate(150,0)")
	// 						.attr('id','bars')
	// 						.selectAll('rect')
	// 						.data(dollars)
	// 						.enter()
	// 						.append('rect')
	// 						.attr('height',19)
	// 						.attr({'x':0,'y':function(d,i){ return yscale(i)+19; }})
	// 						.style('fill',function(d,i){ return colorScale(i); })
	// 						.attr('width',function(d){ return 0; });


	// 	var transit = d3.select("svg").selectAll("rect")
	// 					    .data(dollars)
	// 					    .transition()
	// 					    .duration(1000) 
	// 					    .attr("width", function(d) {return xscale(d); });

	// 	var transitext = d3.select('#bars')
	// 						.selectAll('text')
	// 						.data(dollars)
	// 						.enter()
	// 						.append('text')


