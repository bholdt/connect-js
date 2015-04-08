import Api = require('../core/api');
import Queries = require('../core/queries/queries');
import Config = require('./config');
import Loader = require('./Loader');

export interface Visualization{
    targetElement: HTMLElement;
    loader: Loader;
    displayData(resultsPromise: Q.IPromise<Api.QueryResults>, metadata: Queries.Metadata, showLoader?: boolean): void; 
    clear(): void;   
}