import pandas as pd
import numpy as np
import sqlite3
from bottle import route, run, template, static_file, request, post
from datetime import datetime
import difflib
from sklearn.ensemble import RandomForestClassifier 
from sklearn import cross_validation, metrics
import slowstringdist
from subprocess import Popen, PIPE

def stupid_dist(a,b):
	if(a is None): return 1
	if(b is None): return 1
	A = set(a.lower().strip())
	B = set(b.lower().strip())
	if(a == b): return 0
	return 1-float(len(A.intersection(B)))/len(A.union(B))

def find_closest_pair(source_string,target_list):
	target_list['source_string'] = source_string

	print('One more closest')
	target_list['stupid_dist'] = [stupid_dist(source_string, target) for target in target_list['String'].values]
	return target_list.loc[target_list['stupid_dist'].argmax(), 'String']


conn = sqlite3.connect("data/stringder.sqlite")
conn.text_factory = str

def build_random_forest():
	proc = Popen(['Rscript', "models/build_random_forest.R"], stdout = PIPE)
	(output, err) = proc.communicate()
	exitcode = proc.wait()
	print('Performance: ' + str(output))
	print('He build the random forest')

@route('/file_upload', method='POST')
def file_upload():
	# Transform file upload into pandas dataframe
	print('file_upload')
	source_list = pd.read_csv(request.files.raw_strings.file, names = ["String"])
	source_list['index'] = np.arange(0, source_list.shape[0])
	target_list = pd.read_csv(request.files.clean_strings.file, names = ["String"])
	target_list['index'] = np.arange(0, target_list.shape[0])

	# Store both in SQLite database
	target_list.to_sql(con=conn, name = 'target_list', index = False, if_exists='replace')

	# Calculate pairs for each one
	source_list['closest_match'] = [find_closest_pair(source_string, target_list) for source_string in source_list['String'].values]
	source_list.to_sql(con=conn, name = 'source_list', index = False, if_exists='replace')

@route('/index')
def index():
	return static_file('index.html', root = '')

strings_already_on_frontend = []
variable_importances = 9
precission = 0
recall = 0
auc = 0
false_positives = 0
true_positives = 0
false_negatives = 0
true_negatives = 0
cv_scores = {}

@route('/initialize')
def initialize():
	global strings_already_on_frontend
	c = conn.cursor()
	c.execute("UPDATE votes SET vote = NULL")
	conn.commit()
	strings_already_on_frontend = []
	print('Everything initialized')

@route('/request_string_pair')
def query_two_strings():
	getparams = request.query.decode()
	
	to_vote = pd.read_sql(con = conn, sql = "SELECT votes.dirty_street, votes.kad_street, votes.pair_index, rf_predictions.rf_prediction FROM votes \
													INNER JOIN rf_predictions ON votes.pair_index = rf_predictions.pair_index WHERE votes.vote \
													 IS NULL AND votes.pair_index NOT IN ('" + "','".join(map(str, strings_already_on_frontend)) + "')" + \
													 " AND jw != 0 ORDER BY RANDOM()" + \
													 " LIMIT " + getparams['how_many'])

	to_vote = to_vote.set_index('pair_index', drop = False)
	to_vote['man_vote'] = None
	strings_already_on_frontend.extend(to_vote['pair_index'])
	return to_vote.to_json(orient = 'index')

@route('/query_rf_scores')
def query_rf_scores():
	global variable_importances
	global precission
	global recall
	global auc
	global false_positives
	global true_positives
	global false_negatives
	global true_negatives

	# Read data
	votes = pd.read_sql(con = conn, sql = "SELECT * FROM votes")
	training = pd.read_sql(con = conn, sql = "SELECT * FROM votes WHERE vote IS NOT NULL")
	training = training.drop(['dirty_street', 'kad_street', 'pair_index'], axis = 1)
	if(training.shape[0]>10):
		# Train random forest
		rf = RandomForestClassifier(n_estimators=100, max_depth = 5, random_state =100, class_weight={'Yes':1, 'No':1})
		# Cross validation
		#scores = cross_validation.cross_val_score(rf, training.drop(['vote'],axis = 1), training['vote'], cv=5, n_jobs = -1)	
		predicted = cross_validation.cross_val_predict(rf, training.drop(['vote'],axis = 1),training['vote'], cv=3, n_jobs = -1)
		predicted_num = [1 if x=='Yes' else 0 for x in predicted]
		training_vote_num = [1 if x=='Yes' else 0 for x in training['vote']]

		true_positives = sum([1 if prediction == observation else 0 for (prediction, observation) in zip(predicted_num, training_vote_num) if observation  == 1])
		false_positives = sum([1 if prediction != observation else 0 for (prediction, observation) in zip(predicted_num, training_vote_num) if observation  == 0])
		true_negatives = sum([1 if prediction == observation else 0 for (prediction, observation) in zip(predicted_num, training_vote_num) if observation  == 0])
		false_negatives = sum([1 if prediction != observation else 0 for (prediction, observation) in zip(predicted_num, training_vote_num) if observation  == 1])

		precission = metrics.precision_score(training_vote_num, predicted_num)
		recall = metrics.recall_score(training_vote_num, predicted_num)
		#auc = metrics.roc_auc_score(training_vote_num, predicted_num)

		print('True postives: ' + str(true_positives))
		print('False postives: ' + str(false_positives))
		print('False negatives: ' + str(false_negatives))
		print('Calculated recall: ' + str(true_positives/(float(true_positives + false_negatives))))
		print('Python recall: ' + str(recall) )
		print('Python auc:' + str(auc))

		print(predicted_num)
		print(training_vote_num)

		# Fit, predict and return variable importances
		rf.fit(training.drop(['vote'],axis = 1), training['vote'])
		variable_importances = pd.Series(data = rf.feature_importances_, index = training.drop(['vote'],axis = 1).columns.values)
		rf_predictions = votes.loc[:,['pair_index', 'vote']]
		rf_predictions['rf_prediction'] = rf.predict(votes.drop(['dirty_street', 'kad_street', 'pair_index', 'vote'], axis = 1))
	else:
		#No random forest yet, as not enough training data
		variable_importances = pd.Series(data = np.repeat([0], len(training.drop(['vote'],axis = 1).columns.values)), index = training.drop(['vote'],axis = 1).columns.values)
		#variable_importances = variable_importances.iloc[0:10]
		rf_predictions = votes.loc[:,['pair_index', 'vote']]
		rf_predictions['rf_prediction'] = None
	rf_predictions = rf_predictions.drop(['vote'], axis =1)
	rf_predictions.to_sql(con = conn, name = 'rf_predictions', if_exists = 'replace', index = False)

	rf_predictions = rf_predictions.loc[rf_predictions['pair_index'].map(lambda x: x in strings_already_on_frontend),:]
	rf_predictions = rf_predictions.set_index('pair_index', drop = False)
	return(rf_predictions.to_json(orient = 'index'))

@route('/query_feature_importances')
def query_feature_importances():
	global variable_importances
	return (variable_importances.to_json())

@route('/query_model_KPIs')
def query_model_KPIs():
	global false_positives
	global true_positives
	global false_negatives
	global true_negatives
	global precission
	global recall
	global auc

	training = pd.read_sql(con = conn, sql = "SELECT * FROM votes WHERE vote IS NOT NULL")
	maching = training.loc[training['vote']=='Yes',:].shape[0]
	non_maching = training.loc[training['vote']=='No',:].shape[0]
	model_KPIs = pd.Series(index = ['number_of_votes', 'number_of_matches', 'number_of_non_matches', 'precission', 'recall', 'false_positives', 
													'true_positives', 'true_negatives','false_negatives'], 
		data = [training.shape[0], maching, non_maching, precission, recall, false_positives, true_positives,true_negatives, false_negatives])
	return (model_KPIs.to_json())

@route('/return_vote')
def write_vote():

	getparams = request.query.decode()
	
	sql_query ="UPDATE votes SET vote = ? WHERE pair_index = ?"
	conn.execute(sql_query, [getparams['vote'], getparams['pair_index']])
	conn.commit()

@route('/materialize/css/<path:path>')
def materialize_css(path):
	return static_file(path, root = 'materialize/css/')

@route('/materialize/extras/<path:path>')
def materialize_extras(path):
	return static_file(path, root = 'materialize/extras/')

@route('/materialize/font/roboto/<path:path>')
def materialize_font(path):
	return static_file(path, root = 'materialize/font/roboto/')

@route('/js/<path:path>')
def js(path):
	return static_file(path, root = 'js/')

@route('/materialize/js/<path:path>')
def materialize_js(path):
	return static_file(path, root = 'materialize/js/')

@route('/css/<path:path>')
def css(path):
	return static_file(path, root = 'css')

@route('/font-awesome-4.4.0/<filepath:path>')
def font_awesome(filepath):
	return static_file(filepath, root = 'font-awesome-4.4.0')

run(host='localhost', port=8080, debug=True)