import Api = require('./api');
import Queries = require('./queries/queries');
import Config = require('./config');
import _ = require('underscore');

class Connect {
    static QueryResults = Api.QueryResults;

    private _config: Config.ConnectConfig;
    private _client: Api.Client;

    constructor(config: Config.ConnectConfig) {
        this._config = this.getConfig(config);
        this._client = this._createClient();
    }

    public push(collectionNameOrBatches: any, eventOrEvents?: any): Q.IPromise<any> {
        var hasMultipleEvents = _.isArray(eventOrEvents),
            hasCollectionName = _.isString(collectionNameOrBatches),
            isBatch = !hasCollectionName || hasMultipleEvents,
            batch = isBatch && hasCollectionName ? 
                    this._buildBatchFromArray(collectionNameOrBatches, eventOrEvents) : 
                    collectionNameOrBatches;

        return isBatch ? 
                this._client.pushBatch(batch) : 
                this._client.push(collectionNameOrBatches, eventOrEvents);
    }

    public query(collection: string): Queries.ConnectQuery {
        return new Queries.ConnectQuery(this._client, collection);
    }

    private getConfig(config: Config.ConnectConfig): Config.ConnectConfig {
        return {
            baseUrl: config.baseUrl || 'https://api.getconnect.io',
            projectId: config.projectId,
            apiKey: config.apiKey
        };  
    }

    private _createClient(): Api.Client {
        return new Api.Client(this._config.baseUrl, this._config.projectId, this._config.apiKey);
    }

    private _buildBatchFromArray(collection: string, events: [any]){
        var batch = {};

        batch[collection] = events;
        return batch;
    }
}

export = Connect;