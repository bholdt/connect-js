import Config = require('../config');
import Dataset = require('./dataset');
import Queries = require('../../core/queries/queries');
import Api = require('../../core/api');
import _ = require('underscore');
import Common = require('../visualization');
import ErrorHandling = require('../error-handling');
import Palette = require('../palette');
import Loader = require('../loader');
import Formatters = require('../formatters');
import Dom = require('../dom');
import ResultHandling = require('../result-handling');
import c3 = require('../c3');
import Classes = require('../css-classes');
import deepExtend = require('deep-extend');

class Chart implements Common.Visualization {
    public targetElement: HTMLElement;
    public loader: Loader;
    private _options: Config.VisualizationOptions;
    private _chart: C3.Chart;
    private _rendered: boolean;
    private _destroyDom: () => void;
    private _titleElement: HTMLElement;
    private _currentDataset: Dataset.ChartDataset;
    private _transitionDuration;
    private _resultHandler: ResultHandling.ResultHandler;
    
    constructor(targetElement: string|HTMLElement, chartOptions: Config.VisualizationOptions) {     
        this._options = this._parseOptions(chartOptions);
        this.targetElement = Dom.getElement(targetElement);
        this.loader = new Loader(this.targetElement);
        this._transitionDuration = {
            none: null,
            some: 300
        }
        this._resultHandler = new ResultHandling.ResultHandler();
    }

    private _parseOptions(chartOptions: Config.VisualizationOptions): Config.VisualizationOptions{

        var defaultFormatter = (value: any) => value,
            defaultOptions: Config.VisualizationOptions = {
                transitionOnReload: true,
                intervals: {
                    formats: Config.defaultTimeSeriesFormats
                },
                fields: {},
                chart: {
                    type: 'bar',
                    yAxis: {
                        valueFormatter: defaultFormatter
                    },
                    colorModifier: (currentColor, dataContext) => currentColor
                },                
            },
            options = deepExtend({}, defaultOptions, chartOptions);

        return options;

    }

    public displayData(resultsPromise: Q.IPromise<Api.QueryResults>, reRender: boolean = true): void {
        this._renderChart();
        this._resultHandler.handleResult(resultsPromise, this, this._loadData, reRender);
    }

    public recalculateSize(): void {
        this._chart.flush();
    }

    private getDefaultLegendVisibility(results: Api.QueryResults): boolean {
        var metadata = results.metadata,
            selects = results.selects(),
            hasMultipleSelects = selects.length > 1,
            isGroupedInterval = (metadata.groups.length > 0 && metadata.interval != null);

        return hasMultipleSelects || isGroupedInterval;
    }

    private _loadData(results: Api.QueryResults, reRender: boolean): void {
        var options = this._options,
            type = options.chart.type,
            resultItems = results.results,
            typeOptions = options[type],
            dataset = this._buildDataset(results),
            data = dataset.getData(),
            keys = dataset.getLabels(),
            metadata = results.metadata,
            dateFormat = null,
            standardDateformatter = null,
            customDateFormatter = null,
            timezone = options.timezone || metadata.timezone,
            internalChartConfig = (<any>this._chart).internal.config,
            useTransition = this._chart.data().length && (options.transitionOnReload || !reRender),
            transitionDuration = useTransition ? this._transitionDuration.some : this._transitionDuration.none,
            showLegend = options.chart.showLegend != null ? options.chart.showLegend : this.getDefaultLegendVisibility(results);
 
        internalChartConfig.transition_duration = transitionDuration;
        internalChartConfig.legend_show = showLegend;

        if(metadata.interval) {
            dateFormat = options.intervals.formats[metadata.interval];
            standardDateformatter = (value) => Formatters.formatDate(value, timezone, dateFormat);
            customDateFormatter = options.intervals.valueFormatter;
            internalChartConfig.axis_x_tick_format = customDateFormatter || standardDateformatter;
            internalChartConfig.axis_x_type = 'timeseries';
        }else{
            internalChartConfig.axis_x_categories = _.pluck(data, '_x')
        }
        
        this._currentDataset = dataset;
        this._chart.load({
            json: data,
            keys: {
                x: '_x',
                value: keys
            }
        });
    }
    
    public destroy(): void{        
        this._rendered = false;
        this._destroyDom();
    }

    private _buildDataset(results: Api.QueryResults): Dataset.ChartDataset{
        var options = this._options,
            formatters = {        
                selectLabelFormatter: select => (options.fields[select] || Config.defaulField).label || select,
                groupValueFormatter: (groupByName, groupValue) => this._formatGroupValue(groupByName, groupValue)
            };

        return new Dataset.ChartDataset(results, formatters);
    }

    private _formatValueForLabel(label: string, value: any){ 
        var dataset = this._currentDataset,
            select = this._currentDataset.getSelect(label),
            options = this._options,
            fieldOption = options.fields[select] || Config.defaulField,
            valueFormatter = fieldOption.valueFormatter;

        if (valueFormatter){
            return valueFormatter(value);
        }
        
        return value;
    }

    private _formatGroupValue(groupByName: string, groupValue: any){
        var fieldOption = this._options.fields[groupByName] || Config.defaulField,
            valueFormatter = fieldOption.valueFormatter;

        if (valueFormatter){
            return valueFormatter(groupValue);
        }

        return groupValue;
    }

    private _modifyColor(currentColor: string, datum: any): string {
        var contexts = null,
            colorModifier = this._options.chart.colorModifier;

        if (_.isArray(datum.values))
            contexts = _.map(datum.values, (datumValue) => this._currentDataset.getContext(datumValue));
        else
            contexts = this._currentDataset.getContext(datum);

        if (contexts)
            return colorModifier(currentColor, contexts);
        else
            currentColor;
    }

    private _renderChart() {
        if(this._rendered)
            return;
            
        var options = this._options,
            connectChartContainer = Dom.createElement('div', Classes.viz, Classes.chart),
            c3Element = Dom.createElement('div', Classes.result),
            rootElement = this.targetElement,
            titleElement = Dom.createTitle(options.title),
            yAxisOptions = options.chart.yAxis,
            colors = Palette.getSwatch(options.chart.colors),
            isStartAtZeroSpecified = yAxisOptions.startAtZero != null,
            tooltipValueFormatter = (value, ratio, id, index) => this._formatValueForLabel(id, value),
            config = {
                size: {
                    height: options.chart.height,
                    width: options.chart.width
                },
                padding: options.chart.padding,
                data: {
                    json: [],
                    type: options.chart.type,
                    color: (color, datum) => {
                        return this._modifyColor(color, datum);
                    }
                },
                color: {
                    pattern: colors
                },
                axis: {
                    x: {   
                        type: 'category',
                        tick: {
                            outer: false,
                            format: undefined
                        }
                    },
                    y: {
                        padding: {
                            bottom: 5
                        },
                        tick: {
                            outer: false,
                            format: yAxisOptions.valueFormatter
                        }
                    }
                },
                bar: {},
                area: {},
                transition: {
                    duration: this._transitionDuration.none
                },
                tooltip: {
                    format: {
                        value: tooltipValueFormatter
                    }                   
                }
            };

        connectChartContainer.appendChild(titleElement);
        connectChartContainer.appendChild(c3Element);
        rootElement.appendChild(connectChartContainer);
        config = deepExtend({}, Config.defaultC3ChartOptions, config);
        config['bindto'] = c3Element;

        if (isStartAtZeroSpecified){
             config.area['zerobased'] = yAxisOptions.startAtZero;
             config.bar['zerobased'] = yAxisOptions.startAtZero;
        }

        this._rendered = true;
        this._titleElement = titleElement;
        this._chart = c3.generate(config);
        this._destroyDom = Dom.getDestroyer(connectChartContainer, this._chart);
    }
}

export = Chart;