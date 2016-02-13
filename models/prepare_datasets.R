
require(RMySQL)
require(RSQLite)
require(dplyr)
require(stringdist)
require(XLConnect)

Sys.setlocale(category = 'LC_ALL', locale = 'UTF-8')

# Prepare datasets
con <- dbConnect(RMySQL::MySQL(),username="root",password="root",
                 host="localhost", dbname="grb", 
                 unix.sock="/Applications/MAMP/tmp/mysql/mysql.sock")

kad_street <- dbGetQuery(conn = con, statement = "SELECT DISTINCT (straatnm) FROM gbg_with_features")
kad_street$index <- seq(1:nrow(kad_street))
colnames(kad_street) <- c('Name', 'index')
kad_street$Name <- tolower(kad_street$Name)
dbDisconnect(con)

# Read houses data
setwd("~/Dropbox/Rockestate/usecase KBC")
wb <- loadWorkbook("regio Antwerpen.xls", create = FALSE)
adr <- readWorksheet(wb, sheet = 'regio Antwerpen',
                      colTypes = rep('STRING', 8))
dirty_streets <- as.data.frame(tolower(unique(adr$STR_NM)))
dirty_streets$index <- seq(1:nrow(dirty_streets))
colnames(dirty_streets) <- c('Name', 'index')
dirty_streets$Name <- as.character(dirty_streets$Name)
dirty_streets <- subset(dirty_streets, !is.na(Name))
View(dirty_streets)

# setwd("~/Dropbox/Rockestate/stringder/data")
# load(file = 'adr_with_dirty_streets.Rdata')
# table(adr$issue_2)
# dirty_streets <- adr[,c('issue_2', 'Street')]
# dirty_streets <- subset(dirty_streets, issue_2 != 'perfect street match')
# dirty_streets <- subset(dirty_streets, issue_2 != 'no street given')
# table(dirty_streets$issue_2)
# dirty_streets <- subset(dirty_streets, !is.na(Street))
# dirty_streets <- dirty_streets$Street
# dirty_streets <- as.data.frame(dirty_streets)
# dirty_streets$dirty_streets <- as.character(dirty_streets$dirty_streets)
# dirty_streets$index <- seq(1:nrow(dirty_streets))
# colnames(dirty_streets) <- c('Name', 'index')
# dirty_streets$Name <- tolower(dirty_streets$Name)
# setwd("~/Dropbox/Rockestate/stringder/data")
# save(dirty_streets, kad_street, file = 'Streets_for_stringder.Rdata')

# Write in streets database for webapp
setwd("~/Dropbox/Rockestate/stringder/data")
conn <- dbConnect(drv = SQLite(), 'stringder.sqlite')
dbWriteTable(conn = conn, name = 'source',value =  dirty_streets, overwrite = TRUE)
dbWriteTable(conn = conn, name = 'target',value =  kad_street, overwrite = TRUE)
dbDisconnect(conn)

# Prepare votes
ran_sel <- sample(1:nrow(dirty_streets), 1500)
votes_df <- data.frame(dirty_street = dirty_streets[ran_sel, 'Name'], stringsAsFactors = FALSE)
votes_df <- subset(votes_df, !is.na(dirty_street))
votes_df <- subset(votes_df, dirty_street != '?')
votes_df <- subset(votes_df, nchar(dirty_street) > 5)

# Hulp function, first or last two letters match?
first_or_last_char_match <- function(first_or_last, n_char, word_1, word_2){
  if(first_or_last == 'first'){
      q_n_char_1 <- substr(x = word_1, 1,n_char) 
      q_n_char_2 <- substr(x = word_2, 1,n_char) 
      test <- q_n_char_1 == q_n_char_2
      return(test)
  }else if(first_or_last == 'last'){
      q_n_char_1 <- substr(x = word_1, nchar(word_1)-n_char, nchar(word_1)) 
      q_n_char_2 <- substr(x = word_2, nchar(word_2)-n_char, nchar(word_2)) 
    test <- q_n_char_1 == q_n_char_2
    return(test)
  }
}


sampled_weights <- sample(1:60, 60)/60
lev_weights <- data.frame(weight_1 = sampled_weights[1:20],
                          weight_2 = sampled_weights[21:40],
                          weight_3 = sampled_weights[41:60], 
                          stringsAsFactors = FALSE)

row.names(lev_weights) <- c('lev_1','lev_2', 'lev_3', 'lev_4', 'lev_5', 'lev_6', 'lev_7',
                            'lev_8','lev_9', 'lev_10','lev_11','lev_12', 'lev_13','lev_14',
                            'lev_15','lev_16', 'lev_17','lev_18','lev_19', 'lev_20')

# Feature creation
debug <- TRUE
for(i in 1:nrow(votes_df)){
  print(i)
  kad_street$street_str_dist <- stringdist(kad_street[,c('Name')], 
                                           votes_df[i,'dirty_street'],method = 'jw') 
  
  # Check ofdat het geen perfecte match is
  if(debug){
    if(votes_df[i,'dirty_street'] == kad_street[which.min(kad_street$street_str_dist), 'Name']){
      print('perfect match, continue')
    }
  } 
  if(votes_df[i,'dirty_street'] == kad_street[which.min(kad_street$street_str_dist), 'Name']){
    next
  }
  
  #1 op 5 slechte match geven, opdat het algoritme ook op slechte matches traint
  if(runif(n = 1)>0.8){
    votes_df[i,'kad_street'] <- kad_street$Name[order(kad_street$street_str_dist)[2]]
  }else{
    votes_df[i,'kad_street'] <- kad_street[which.min(kad_street$street_str_dist), 'Name'] 
  }
  if(debug){
    print(paste('Dirty street: ', votes_df[i,'dirty_street']) )
    print(paste('Kad street: ', votes_df[i,'kad_street']) )
  }
  
  votes_df[i,'jw'] <- min(kad_street$street_str_dist)
  votes_df[i,'jaccard_q_2'] <- stringdist(votes_df[i,'kad_street'], 
                                      votes_df[i,'dirty_street'],method = 'jaccard', q=2) 
  votes_df[i,'jaccard_q_3'] <- stringdist(votes_df[i,'kad_street'], 
                                      votes_df[i,'dirty_street'],method = 'jaccard', q=3) 
  votes_df[i,'jaccard_q_4'] <- stringdist(votes_df[i,'kad_street'], 
                                      votes_df[i,'dirty_street'],method = 'jaccard', q=4) 
  votes_df[i,'jaccard_q_5'] <- stringdist(votes_df[i,'kad_street'], 
                                      votes_df[i,'dirty_street'],method = 'jaccard', q=5) 
  votes_df[i,'cosine_q_2'] <- stringdist(votes_df[i,'kad_street'], 
                                     votes_df[i,'dirty_street'],method = 'cosine', q=2) 
  votes_df[i,'cosine_q_3'] <- stringdist(votes_df[i,'kad_street'], 
                                         votes_df[i,'dirty_street'],method = 'cosine', q=3) 
  votes_df[i,'cosine_q_4'] <- stringdist(votes_df[i,'kad_street'], 
                                         votes_df[i,'dirty_street'],method = 'cosine', q=4) 
  votes_df[i,'cosine_q_5'] <- stringdist(votes_df[i,'kad_street'], 
                                         votes_df[i,'dirty_street'],method = 'cosine', q=5) 
  
  votes_df[i,'levenshtein'] <- stringdist(votes_df[i,'kad_street'], 
                                 votes_df[i,'dirty_street'],method = 'lv') 
  
  for(j in 1:nrow(lev_weights)){
    votes_df[i,row.names(lev_weights)[j]] <- stringdist(votes_df[i,'kad_street'], 
                                            votes_df[i,'dirty_street'],method = 'lv',
                                            weight = as.numeric(lev_weights[j,]) )
  }
  
  votes_df[i,'q_2_gram'] <- stringdist(votes_df[i,'kad_street'], 
                                 votes_df[i,'dirty_street'],method = 'qgram', q=2) 
  votes_df[i,'q_3_gram'] <- stringdist(votes_df[i,'kad_street'], 
                                       votes_df[i,'dirty_street'],method = 'qgram', q=3) 
  votes_df[i,'q_4_gram'] <- stringdist(votes_df[i,'kad_street'], 
                                       votes_df[i,'dirty_street'],method = 'qgram', q=4) 
  votes_df[i,'q_5_gram'] <- stringdist(votes_df[i,'kad_street'], 
                                       votes_df[i,'dirty_street'],method = 'qgram', q=5) 
  
  
  votes_df[i,'d_has_point'] <- grepl(pattern = "\\.", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_point'] <- grepl(pattern = "\\.", votes_df[i,'kad_street'])
  votes_df[i,'d_has_space'] <- grepl(pattern = " ", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_space'] <- grepl(pattern = " ", votes_df[i,'kad_street'])
  votes_df[i,'d_has_straat'] <- grepl(pattern = "straat", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_straat'] <- grepl(pattern = "straat", votes_df[i,'kad_street'])
  votes_df[i,'d_has_str'] <- grepl(pattern = "str", votes_df[i,'dirty_street'])
  votes_df[i,'d_has_steenweg'] <- grepl(pattern = "steenweg", votes_df[i,'dirty_street'])
  votes_df[i,'d_has_stwg'] <- grepl(pattern = "stwg", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_steenweg'] <- grepl(pattern = "steenweg", votes_df[i,'kad_street'])
  votes_df[i,'d_has_laan'] <- grepl(pattern = "laan", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_laan'] <- grepl(pattern = "laan", votes_df[i,'kad_street'])
  votes_df[i,'d_has_baan'] <- grepl(pattern = "baan", votes_df[i,'dirty_street'])
  votes_df[i,'k_has_baan'] <- grepl(pattern = "baan", votes_df[i,'kad_street'])
  votes_df[i,'both_have_space'] <- ifelse( votes_df[i,'d_has_space'] & votes_df[i,'k_has_space'],
                                           TRUE, FALSE)
  votes_df[i,'both_have_street'] <- ifelse((votes_df[i,'d_has_straat'] & votes_df[i,'k_has_straat'])|
                                            (votes_df[i,'d_has_str'] & votes_df[i,'k_has_straat']) ,
                                           TRUE, FALSE)
  votes_df[i,'both_have_steenweg'] <- ifelse((votes_df[i,'d_has_steenweg'] & votes_df[i,'k_has_steenweg'])|
                                             (votes_df[i,'d_has_stwg'] & votes_df[i,'k_has_steenweg']) ,
                                           TRUE, FALSE)
  votes_df[i,'both_have_laan'] <- ifelse((votes_df[i,'d_has_laan'] & votes_df[i,'k_has_laan']) ,
                                             TRUE, FALSE)
  votes_df[i,'both_have_k_has_baan'] <- ifelse((votes_df[i,'d_has_baan'] & votes_df[i,'k_has_baan']) ,
                                         TRUE, FALSE)
  
  kad_cleaned <- gsub('steenweg', '', votes_df[i,'kad_street'])
  kad_cleaned <- gsub('straat', '', kad_cleaned)
  kad_cleaned <- gsub('laan', '', kad_cleaned)
  kad_cleaned <- gsub('baan', '', kad_cleaned)
  
  to_vote_cleaned <- gsub('steenweg', '',  votes_df[i,'dirty_street'])
  to_vote_cleaned <- gsub('straat', '', to_vote_cleaned)
  to_vote_cleaned <- gsub('str', '', to_vote_cleaned)
  to_vote_cleaned <- gsub('str.', '', to_vote_cleaned)
  to_vote_cleaned <- gsub('laan', '', to_vote_cleaned)
  to_vote_cleaned <- gsub('baan', '', to_vote_cleaned)

  votes_df[i,'cl_jaccard_q_2'] <- stringdist(kad_cleaned, 
                                          to_vote_cleaned,method = 'jaccard', q=2) 
  votes_df[i,'cl_jaccard_q_3'] <- stringdist(kad_cleaned, 
                                          to_vote_cleaned,method = 'jaccard', q=3) 
  votes_df[i,'cl_cosine_q_2'] <- stringdist(kad_cleaned, 
                                         to_vote_cleaned,method = 'cosine', q=2) 
  votes_df[i,'cl_cosine_q_3'] <- stringdist(kad_cleaned, 
                                         to_vote_cleaned,method = 'cosine', q=3) 
  votes_df[i,'cl_levenshtein'] <- stringdist(kad_cleaned, 
                                          to_vote_cleaned,method = 'lv') 
  
  for(j in 1:nrow(lev_weights)){
    votes_df[i,paste('cl_',row.names(lev_weights)[j])] <- stringdist(votes_df[i,'kad_street'], 
                                                        votes_df[i,'dirty_street'],method = 'lv',
                                                        weight = as.numeric(lev_weights[j,]) )
  }

  votes_df[i,'cl_q_2_gram'] <- stringdist(kad_cleaned, 
                                       to_vote_cleaned,method = 'qgram', q=2) 
  votes_df[i,'cl_q_3_gram'] <- stringdist(kad_cleaned, 
                                       to_vote_cleaned,method = 'qgram', q=3) 
  
  votes_df[i,'q_3_last'] <- first_or_last_char_match('last', 3, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street'])
  votes_df[i,'q_2_last'] <- first_or_last_char_match('last', 2, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street'])
  votes_df[i,'q_1_last'] <- first_or_last_char_match('last', 1, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street'])  
  votes_df[i,'q_3_first'] <- first_or_last_char_match('first', 3, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street'])
  votes_df[i,'q_2_first'] <- first_or_last_char_match('first', 2, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street'])
  votes_df[i,'q_1_first'] <- first_or_last_char_match('first', 1, 
                                                     votes_df[i,'dirty_street'], votes_df[i,'kad_street']) 
  
}

votes_df <- subset(votes_df, jw !=0)
votes_df <- subset(votes_df, !is.na(cl_q_3_gram))

votes_df$length_ratio <- nchar(votes_df$dirty_street)/nchar(votes_df$kad_street)
votes_df$lenght_diff <- nchar(votes_df$dirty_street)-nchar(votes_df$kad_street)
n_words <- function(x){
  sapply(gregexpr("[[:alpha:]]+", x), function(x) sum(x > 0))
}
votes_df$n_words_d_street <- sapply(votes_df$dirty_street, n_words)
votes_df$n_words_k_street <- sapply(votes_df$kad_street, n_words)
votes_df$different_n_words <- with(votes_df, ifelse(n_words_d_street == n_words_k_street,
                                                    TRUE, FALSE))
votes_df <- subset(votes_df, nchar(kad_street)>5)
votes_df$vote <- NA
votes_df$pair_index <- paste0('pair_',seq(1:nrow(votes_df)))
# Write vote in database for webapp
setwd("~/Dropbox/Rockestate/stringder/data")
conn <- dbConnect(drv = SQLite(), 'stringder.sqlite')
dbWriteTable(conn = conn, name = 'votes',value =  votes_df, overwrite = TRUE)
dbDisconnect(conn)

# Write vote in database for webapp
setwd("~/Dropbox/Rockestate/stringder/data")
conn <- dbConnect(drv = SQLite(), 'stringder.sqlite')
temp <- votes_df
temp$rf_prediction <- NA
temp <- temp[,c('pair_index','rf_prediction')]
dbWriteTable(conn = conn, name = 'rf_predictions',value =  temp, overwrite = TRUE)
dbDisconnect(conn)

