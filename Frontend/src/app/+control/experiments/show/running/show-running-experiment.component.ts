import {Component, OnInit, OnDestroy} from '@angular/core';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {NotificationsService} from "angular2-notifications";
import {LayoutService} from "../../../../shared/modules/helper/layout.service";
import {Experiment, Target, OEDAApiService, StageEntity, OedaCallbackEntity} from "../../../../shared/modules/api/oeda-api.service";
import {AmChart} from "@amcharts/amcharts3-angular";
import {isNullOrUndefined} from "util";
import {Observable} from "rxjs/Observable";
import {PlotService} from "../../../../shared/util/plot-service";
import {EntityService} from "../../../../shared/util/entity-service";
import {TempStorageService} from "../../../../shared/modules/helper/temp-storage-service";

@Component({
  selector: 'show-running-experiment',
  templateUrl: './show-running-experiment.component.html'
})

// QQ plot reference: https://gist.github.com/mbostock/4349187

export class ShowRunningExperimentComponent implements OnInit, OnDestroy {
  private scatter_plot: AmChart;
  private histogram: AmChart;

  public dataAvailable: boolean;
  public is_collapsed: boolean;
  public first_render_of_page: boolean;

  private divId: string;
  private histogramDivId: string;
  private qqPlotDivId: string;
  private qqPlotDivIdJS: string;
  private filterSummaryId: string;
  private histogramLogDivId: string;
  private processedData: any;
  private timer: any;
  private subscription: any;
  private first_render_of_plots: boolean;
  private experiment_ended: boolean;
  private timestamp: string;
  private stage_details: string;

  private decimal_places: number;
  private all_data: StageEntity[];

  public experiment_id: string;
  public experiment: Experiment;
  public targetSystem: Target;

  public initial_threshold_for_scatter_plot: number;
  public nr_points_to_be_filtered: number;

  // following attributes are used for QQ plotting in Python
  public available_distributions: object;
  public distribution: string;
  public scale: string;
  public is_qq_plot_rendered: boolean;

  public selected_stage_for_qq_js: string;
  public qqJSPlotIsRendered: boolean;
  public is_enough_data_for_plots: boolean;
  public is_all_stages_selected: boolean;

  public incoming_data_type: object;

  public available_stages = [];
  // public available_stages_for_qq_js = [];

  public selected_stage: any;
  public oedaCallback: OedaCallbackEntity;


  constructor(private layout: LayoutService,
              private apiService: OEDAApiService,
              private entityService: EntityService,
              private plotService: PlotService,
              private activated_route: ActivatedRoute,
              private router: Router,
              private notify: NotificationsService,
              private temp_storage: TempStorageService
  ) {

    this.layout.setHeader("Experiment Results", "");
    this.dataAvailable = false;
    this.is_all_stages_selected = false;
    this.is_qq_plot_rendered = false;
    this.qqJSPlotIsRendered = false;
    this.is_enough_data_for_plots = false;
    this.experiment_ended = false;
    this.is_collapsed = true;
    this.first_render_of_page = true;
    this.all_data = [];
    this.scale = "Normal";
    this.first_render_of_plots = true;
    this.decimal_places = 3;
    this.distribution = "Norm";
    this.available_distributions = ['Norm', 'Gamma', 'Logistic', 'T', 'Uniform', 'Lognorm', 'Loggamma'];
    this.incoming_data_type = null;
    this.selected_stage_for_qq_js = "Select a stage";
    this.oedaCallback = this.entityService.create_oeda_callback_entity();


    this.divId = "chartdiv";
    this.histogramDivId = "histogram";
    this.histogramLogDivId = "histogram_log";
    this.filterSummaryId = "filterSummary";
    this.qqPlotDivId = "qqPlot";
    this.qqPlotDivIdJS = "qqPlotJS";

    // subscribe to router event
    this.activated_route.params.subscribe((params: Params) => {
      // id is retrieved from URI
      if (params["id"] && this.router.url.toString().includes("/control/experiments/show")) {
        this.experiment_id = params["id"];
      }
    });
  }

  /* tslint:disable */

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  ngOnInit() {
    if (!isNullOrUndefined(this.experiment_id)) {
      this.apiService.loadExperimentById(this.experiment_id).subscribe(experiment => {
        if (!isNullOrUndefined(experiment)) {
          this.experiment = experiment;
          this.experiment.id = this.experiment_id;
          if (!isNullOrUndefined(experiment.targetSystemId)) {
            // retrieve target system
            this.apiService.loadTargetById(experiment.targetSystemId).subscribe(targetSystem => {
              if (!isNullOrUndefined(targetSystem)) {
                this.targetSystem = targetSystem;
                this.targetSystem.id = this.experiment.targetSystemId;
                // retrieve stages
                this.apiService.loadAvailableStagesWithExperimentId(this.experiment_id).subscribe(stages => {
                  if (!isNullOrUndefined(stages)) {
                    // initially selected stage is "All Stages"
                    this.selected_stage = {"number": -1, "knobs": {}};
                    this.selected_stage.knobs = this.entityService.populate_knob_objects_with_variables(this.selected_stage.knobs, this.targetSystem.defaultVariables, true, this.experiment.executionStrategy.type);
                    this.available_stages.push(this.selected_stage);
                    for (let j = 0; j < stages.length; j++) {
                      // if there are any existing stages, round their knob values of stages to provided decimals
                      if (!isNullOrUndefined(stages[j]["knobs"])) {
                        console.log(stages[j]["knobs"]);
                        stages[j]["knobs"] = this.entityService.round_knob_values(stages[j]["knobs"], this.decimal_places);
                        stages[j]["knobs"] = this.entityService.populate_knob_objects_with_variables(stages[j]["knobs"], this.targetSystem.defaultVariables, false, this.experiment.executionStrategy.type);
                      }
                      this.available_stages.push(stages[j]);
                    }
                    stages.sort(this.entityService.sort_by('number', true, parseInt));

                    // prepare available stages for qq js that does not include all stages
                    // this.available_stages_for_qq_js = this.available_stages.slice(1);
                    this.dataAvailable = true;

                    // polling using Timer (2 sec interval) for real-time data visualization
                    this.timer = Observable.timer(1000, 4000);
                    this.subscription = this.timer.subscribe(() => {
                      this.fetch_oeda_callback();
                    });

                  }
                });
              }
            });
          }
        } else {
          this.notify.error("Error", "Cannot retrieve details of selected experiment, make sure DB is up and running");
        }
      });
    } else {
      this.notify.error("Error", "Failed retrieving experiment id, please check URI");
    }

  }

  private fetch_oeda_callback() {
    const ctrl = this;
    // also set "polling-on" button disabled, because polling is already on
    document.getElementById("polling_on_button").setAttribute('disabled', 'true');

    ctrl.apiService.getOedaCallback(ctrl.experiment_id).subscribe(oedaCallback => {
      if(!isNullOrUndefined(oedaCallback)) {
        ctrl.oedaCallback["status"] = oedaCallback.status;
        ctrl.oedaCallback["stage_counter"] = oedaCallback.stage_counter;

        // keywords (index, size) are same for the first two cases, but they indicate different things
        if (oedaCallback.status === "PROCESSING") {
          ctrl.oedaCallback["message"] = oedaCallback.message;
        } else if (oedaCallback.status == "IGNORING_SAMPLES" || oedaCallback.status == "COLLECTING_DATA") {
          ctrl.oedaCallback["index"] = oedaCallback.index;
          ctrl.oedaCallback["size"] = oedaCallback.size;
          ctrl.oedaCallback["complete"] = (Number(oedaCallback.index)) / (Number(oedaCallback.size));

          // round knob values to provided decimal places (provided that execution strategy is not forever)
          if (ctrl.experiment.executionStrategy.type !== "forever") {
            oedaCallback.current_knob = ctrl.entityService.round_knob_values(oedaCallback.current_knob, ctrl.decimal_places);
          }
          // remaining_time_and_stages is a experiment-wise unique dict that contains remaining stages and time
          ctrl.oedaCallback.remaining_time_and_stages["remaining_time"] = oedaCallback.remaining_time_and_stages["remaining_time"];
          ctrl.oedaCallback.remaining_time_and_stages["remaining_stages"] = oedaCallback.remaining_time_and_stages["remaining_stages"];
          ctrl.oedaCallback.current_knob = oedaCallback.current_knob;
          // fetch data from backend
          if (oedaCallback.status == "COLLECTING_DATA") {
            if (ctrl.first_render_of_page) {
              ctrl.apiService.loadAllDataPointsOfExperiment(ctrl.experiment_id).subscribe(response => {
                let is_successful_fetch = ctrl.process_response(response);
                if (ctrl.incoming_data_type == null)
                  ctrl.incoming_data_type = ctrl.entityService.get_candidate_data_type(ctrl.experiment, ctrl.targetSystem, ctrl.all_data[0]);

                if (is_successful_fetch && !isNullOrUndefined(ctrl.incoming_data_type)) {
                  ctrl.first_render_of_page = false;
                  ctrl.draw_all_plots();
                }
              });
            } else {
              if (ctrl.timestamp == undefined) {
                ctrl.timestamp = "-1";
              }
              ctrl.apiService.loadAllDataPointsOfRunningExperiment(ctrl.experiment_id, ctrl.timestamp).subscribe(response => {
                ctrl.process_response(response);
                if (ctrl.incoming_data_type == null)
                  ctrl.incoming_data_type = ctrl.entityService.get_candidate_data_type(ctrl.experiment, ctrl.targetSystem, ctrl.all_data[0]);
                ctrl.draw_all_plots();
              });
            }
          }

        } else if (oedaCallback.status == "EXPERIMENT_STAGE_DONE") {
          if (oedaCallback.remaining_time_and_stages["remaining_stages"] == 0) {
            ctrl.disable_polling("Success", "Data is up-to-date, stopped polling.");

            // switch to successful experiment page to show other plots to the user
            ctrl.router.navigate(["control/experiments/show/"+ctrl.experiment_id+"/success"]).then(() => {
              console.log("navigated to successful experiments page");
            });
          }
        }
      }
    });
  }

  /** refactoring this method (integrating it into entityService) makes significant/drastic changes in user-experience
   * in terms of delays,
   * spikes while validating/updating all_data.
   */
  private process_response(response) {
    const ctrl = this;
    if (isNullOrUndefined(response)) {
      ctrl.notify.error("Error", "Cannot retrieve data from DB, please try again");
      return;
    }
    if (ctrl.first_render_of_page) {
      // we can retrieve one or more stages at first render
      for (let index in response) {
        if (response.hasOwnProperty(index)) {
          let parsed_json_object = JSON.parse(response[index]);
          // distribute data points to empty bins
          let new_entity = ctrl.entityService.create_stage_entity();
          new_entity.number = parsed_json_object['number'];
          new_entity.values = parsed_json_object['values'];
          // round knob values before pushing to all_data (provided that execution strategy is not forever)
          if (ctrl.experiment.executionStrategy.type !== "forever") {
            new_entity.knobs = ctrl.entityService.round_knob_values(parsed_json_object['knobs'], ctrl.decimal_places);
          } else {
            new_entity.knobs = parsed_json_object['knobs'];
          }

          if (new_entity.values.length != 0) {
            ctrl.all_data.push(new_entity);
          }
          // as a guard against stage duplications
          // also round stages retrieved at first render to provided decimal places (provided that execution strategy is not forever)
          let existing_stage = ctrl.available_stages.find(entity => entity.number === new_entity.number);
          // stage does not exist yet
          if (isNullOrUndefined(existing_stage)) {
            const new_stage = {"number": parsed_json_object.number};
            if (ctrl.experiment.executionStrategy.type !== "forever") {
              new_stage["knobs"] = ctrl.entityService.round_knob_values(parsed_json_object.knobs, ctrl.decimal_places);
            }
            else
              new_stage["knobs"] = parsed_json_object.knobs;
            new_stage["knobs"] = ctrl.entityService.populate_knob_objects_with_variables(new_stage["knobs"], ctrl.targetSystem.defaultVariables, false, this.experiment.executionStrategy.type);
            ctrl.available_stages.push(new_stage);
            // ctrl.available_stages_for_qq_js.push(new_stage);
          }
          // do not update timestamp here if we can't retrieve any data, just keep fetching with timestamp "-1"
          // because backend is also updated accordingly, i.e. it continues to fetch all data if timestamp is -1
        }
      }
      ctrl.first_render_of_page = false;
      return true;
    } else {
      // we can retrieve one or more stages upon other polls
      // so, iterate the these stages and concat their data_points with existing data_points
      for (let index in response) {
        let parsed_json_object = JSON.parse(response[index]);
        let existing_stage = ctrl.all_data.find(entity => entity.number === parsed_json_object.number);

        // we have found an existing stage
        if (existing_stage !== undefined) {
          let stage_index = parsed_json_object['number'] - 1;
          if (parsed_json_object['values'].length > 0) {
            ctrl.all_data[stage_index].values = ctrl.all_data[stage_index].values.concat(parsed_json_object['values']);
          }
        } else {
          // a new stage has been fetched, create a new bin for it, and push all the values to the bin, also push bin to all_data, round knob values to provided decimal places (provided that execution strategy is not forever)
          const number = parsed_json_object['number'];
          const values = parsed_json_object['values'];
          let knobs;
          if (this.experiment.executionStrategy.type !== "forever")
            knobs = ctrl.entityService.round_knob_values(parsed_json_object['knobs'], ctrl.decimal_places);
          else
            knobs = parsed_json_object['knobs'];
          const new_stage = {"number": number, "knobs": knobs};
          new_stage["knobs"] = ctrl.entityService.populate_knob_objects_with_variables(new_stage["knobs"], ctrl.targetSystem.defaultVariables, false, this.experiment.executionStrategy.type);
          ctrl.available_stages.push(new_stage);

          let new_entity = ctrl.entityService.create_stage_entity();
          new_entity.number = number;
          new_entity.values = values;
          new_entity.knobs = knobs;
          ctrl.all_data.push(new_entity);
        }
        // update timestamp if we have retrieved a data
        if (Number(index) == response.length - 1) {
          let data_point_length = parsed_json_object['values'].length;
          if (data_point_length > 0) {
            ctrl.timestamp = parsed_json_object.values[data_point_length - 1]['createdDate'];
            return true;
          }
        }

      }
    }
  }

  /** uses stage_object (that can be either one stage or all_stage) and PlotService to draw plots accordingly */
  private draw_all_plots() {
    const ctrl = this;
    // set it to false in case a new scale is selected
    ctrl.is_enough_data_for_plots = false;

    // if "all stages" is selected
    if (ctrl.selected_stage.number == -1) {
      ctrl.processedData = ctrl.entityService.process_all_stage_data(ctrl.all_data, "timestamp", "value", ctrl.scale, ctrl.incoming_data_type["name"], false);
      ctrl.stage_details = "All Stages";
    }
    // if any other stage is selected
    else {
      ctrl.processedData = ctrl.all_data[ctrl.selected_stage.number - 1];
      ctrl.processedData = ctrl.entityService.process_single_stage_data(ctrl.processedData,"timestamp", "value", ctrl.scale, ctrl.incoming_data_type["name"], false);
      // ctrl.processedData is the stage object here
      ctrl.stage_details = ctrl.entityService.get_stage_details(ctrl.selected_stage);
    }
    if (!isNullOrUndefined(ctrl.processedData)) {
      // https://stackoverflow.com/questions/597588/how-do-you-clone-an-array-of-objects-in-javascript
      const clonedData = JSON.parse(JSON.stringify(ctrl.processedData));
      ctrl.initial_threshold_for_scatter_plot = ctrl.plotService.calculate_threshold_for_given_percentile(clonedData, 95, 'value', ctrl.decimal_places);
      // just to inform user about how many points are above the calculated threshold (95-percentile)
      ctrl.nr_points_to_be_filtered = ctrl.processedData.filter(function (item) {
        return item.value > ctrl.initial_threshold_for_scatter_plot;
      }).length;

      // just to override the text in div
      // if user previously clicked in the chart; but new data has come, so we should update div that tells user updated threshold and number of points to filtered.
      document.getElementById(ctrl.filterSummaryId).innerHTML = "<p>Threshold for 95-percentile: <b>" + ctrl.initial_threshold_for_scatter_plot + "</b> and # of points to be removed: <b>" + ctrl.nr_points_to_be_filtered + "</b></p>";

      if (ctrl.first_render_of_plots) {
        ctrl.scatter_plot = ctrl.plotService.draw_scatter_plot(ctrl.divId, ctrl.filterSummaryId, ctrl.processedData, ctrl.incoming_data_type["name"], ctrl.initial_threshold_for_scatter_plot, ctrl.stage_details, ctrl.decimal_places);
        ctrl.histogram = ctrl.plotService.draw_histogram(ctrl.histogramDivId, ctrl.processedData, ctrl.incoming_data_type["name"], ctrl.stage_details, ctrl.decimal_places);
        ctrl.first_render_of_plots = false;
      } else {
        // now update (validate) values & threshold value and its guide (line) of the scatter plot & also update title
        ctrl.scatter_plot.dataProvider = ctrl.processedData;
        ctrl.scatter_plot.graphs[0].negativeBase = ctrl.initial_threshold_for_scatter_plot;
        ctrl.scatter_plot.valueAxes[0].guides[0].value = ctrl.initial_threshold_for_scatter_plot;
        ctrl.scatter_plot.titles[0].text = ctrl.stage_details;
        // also rename label of charts in case of a change
        ctrl.scatter_plot.valueAxes[0].title = ctrl.incoming_data_type["name"];
        ctrl.histogram.categoryAxis.title = ctrl.incoming_data_type["name"];
        // https://docs.amcharts.com/3/javascriptcharts/AmChart, following refers to validateNow(validateData = true, skipEvents = false)
        ctrl.scatter_plot.ignoreZoomed = true;
        ctrl.scatter_plot.validateNow(true, false);
        ctrl.histogram.dataProvider = ctrl.plotService.categorize_data(ctrl.processedData, ctrl.decimal_places);
        ctrl.histogram.validateData();
      }
      ctrl.is_enough_data_for_plots = true;
    } else {
      ctrl.is_enough_data_for_plots = false;
      this.notify.error("Cannot retrieve data from server, please restart experiment");
    }
  }

  /** called when stage dropdown (All Stages, Stage 1 [...], Stage 2 [...], ...) in main page is changed */
  stage_changed(selected_stage) {
    if (selected_stage !== null)
      this.selected_stage = selected_stage;
    if (!isNullOrUndefined(this.incoming_data_type)) {
      if (this.entityService.scale_allowed(this.scale, this.incoming_data_type["scale"])) {
        this.draw_all_plots();
      } else {
        // inform user and remove graphs from page for now
        this.is_enough_data_for_plots = false;
        this.notify.error(this.scale + " scale cannot be applied to " + this.incoming_data_type["name"]);
      }
    } else {
      this.is_enough_data_for_plots = false;
      this.notify.error("Incoming data type is null, select it from dropdown list");
    }

  }

  /** called when scale dropdown (Normal, Log) in main page is changed */
  scale_changed(user_selected_scale) {
    this.scale = user_selected_scale;
    if (this.entityService.scale_allowed(this.scale, this.incoming_data_type["scale"])) {
      this.draw_all_plots();
    } else {
      // inform user and remove graphs from page for now
      this.is_enough_data_for_plots = false;
      this.notify.error(this.scale + " scale cannot be applied to " + this.incoming_data_type["name"]);
    }
  }

  /** called when incoming data type of the target system is changed */
  incoming_data_type_changed(incoming_data_type) {
    this.incoming_data_type = incoming_data_type;
    if (this.entityService.scale_allowed(this.scale, this.incoming_data_type["scale"])) {
      this.draw_all_plots();
    } else {
      // inform user and remove graphs from page for now
      this.is_enough_data_for_plots = false;
      this.notify.error(this.scale + " scale cannot be applied to " + this.incoming_data_type["name"]);
    }
  }

  /** returns keys of the given map */
  get_keys(object) : Array<string> {
    return this.entityService.get_keys(object);
  }

  is_considered(data_type_name) {
    return this.entityService.is_considered(this.experiment.considered_data_types, data_type_name);
  }

  // helper function that filters out data above the given threshold
  filter_outliers(event) {
    const target = event.target || event.srcElement || event.currentTarget;
    const idAttr = target.attributes.id;
    const value = idAttr.nodeValue;
    console.log(target);
    console.log(idAttr);
    console.log(value);
  }

  /** disables polling upon user click, and informs user */
  disable_polling(status: string, content: string) {
    document.getElementById("polling_off_button").setAttribute('class', 'btn btn-primary active');
    document.getElementById("polling_off_button").setAttribute('disabled', 'true');
    document.getElementById("polling_on_button").setAttribute('class', 'btn btn-default');
    document.getElementById("polling_on_button").removeAttribute('disabled');
    this.subscription.unsubscribe();
    if (!isNullOrUndefined(status) && !isNullOrUndefined(content)) {
      this.notify.success(status, content);
    } else {
      this.notify.success("Success", "Polling disabled");
    }
  }

  /** re-creates the subscription object to periodically fetch data from server */
  enable_polling() {
    document.getElementById("polling_on_button").setAttribute('class', 'btn btn-primary active');
    document.getElementById("polling_on_button").setAttribute('disabled', 'true');
    document.getElementById("polling_off_button").setAttribute('class', 'btn btn-default');
    document.getElementById("polling_off_button").removeAttribute('disabled');

    this.subscription = this.timer.subscribe(() => {
      this.fetch_oeda_callback();
    });
    this.notify.success("Success", "Polling enabled");
  }

  stopRunningExperiment(): void {
    this.experiment.status = "INTERRUPTED";
    this.apiService.updateExperiment(this.experiment).subscribe(() => {
      this.targetSystem.status = "READY";
      this.apiService.updateTarget(this.targetSystem).subscribe(() => {
        this.subscription.unsubscribe();
        // set temp_storage so that experiments page will reflect the new status of it
        this.temp_storage.setNewValue(this.experiment);
        this.notify.success("Success", "Experiment stopped successfully");
        // switch to regular experiments page
        this.router.navigate(["control/experiments"]);
      }, errorResp2 => {
        this.notify.error("Error", errorResp2.message);
      });
    }, errorResp => {
      this.notify.error("Error", errorResp.message);
    });
  }


}
