
require(randomForest)
require(caret)
require(RSQLite)
require(dplyr)
require(rjson)


# Read data
setwd("~/Dropbox/Rockestate/stringder/data")
conn <- dbConnect(drv = SQLite(), 'stringder.sqlite')
votes <- dbGetQuery(conn = conn,statement = 'SELECT * FROM votes')
votes$length_ratio <- nchar(votes$dirty_street)/nchar(votes$kad_street)
training <- select(votes, -dirty_street, -kad_street, -pair_index)
training <- filter(training, !is.na(vote))
training$vote <- as.factor(training$vote)

# Build random forest
rf_model<-train( vote~., data=training,method="rf",metric='Kappa',
                trControl=trainControl(method="cv",number=5),
                prox=TRUE,allowParallel=TRUE)

# varImp(rf_model)


votes$rf_prediction <- predict(rf_model, newdata = votes)
dbWriteTable(conn = conn, name = 'rf_predictions', value = votes[,c('pair_index', 'rf_prediction')],
             overwrite = TRUE)
dbDisconnect(conn)
performance <- rf_model$results[rf_model$results$mtry==as.numeric(rf_model$bestTune['mtry']), 'Kappa']
cat(toJSON(performance))