import {Component, EventEmitter, Input, OnInit, Output} from "@angular/core";
import {OedaCallbackEntity} from "../api/oeda-api.service";
import {isNullOrUndefined} from "util";
import * as _ from "lodash";


@Component({
  selector: 'experiment-stages-paginator',
  template: `
    <div class="col-md-12" [hidden]="hidden">
      <div class="panel panel-default chartJs">
        <div class="panel-heading">
          <div class="row">
            <div class="col-md-4">
              <div class="card-title">
                Incoming Data Type
                <select class="form-control" [(ngModel)]="incoming_data_type" (ngModelChange)="onIncomingDataTypeChange($event)">
                  <option *ngFor="let dataType of targetSystem.incomingDataTypes" [ngValue]="dataType">
                    {{dataType.name}}
                  </option>
                </select>
              </div>
            </div>
            
            <div class="col-md-4">
              <div class="card-title">
                Scale
                <select class="form-control" required [(ngModel)]="scale" (ngModelChange)="onScaleChange($event)">
                  <option selected>Normal</option>
                  <option>Log</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="panel-body" style="padding-top: 20px; padding-left: 2%">
          <div class="table-responsive">
            <table style="margin-top: 20px" class="table table-bordered table-hover" [mfData]="available_stages" #mf="mfDataTable"
                   [mfRowsOnPage]="3">
              <thead>
              <tr>
                <th style="width:5%">
                  Stage
                </th>
                <!-- Default Knobs Header (this is always in the same order because we retrieve it from config)-->
                <th style="width: 3%" *ngFor="let default_knob of targetSystem.defaultVariables"> 
                  {{default_knob.name}}
                </th>
              </tr>
              </thead>
              <tbody class="bigTable">
                <tr *ngFor="let item of mf.data; let i = index;" (click)="onRowClick(item)" [class.active]="item.number == selected_row">
                  <td *ngIf="item.number === -1 && experiment.executionStrategy.type === 'forever'" data-toggle="tooltip" title="Default values of {{targetSystem.name}} are shown on this row">
                    <b>All Stages</b> 
                  </td>
                  <td *ngIf="item.number === -1 && experiment.executionStrategy.type !== 'forever'" data-toggle="tooltip" title="Min & Max values of changeable variables and default values of non-changeable variables are shown on this row">
                    <b>All Stages</b>
                  </td>
                  <td *ngIf="item.number !== -1" data-toggle="tooltip" title="Click to draw plots">
                    {{item.number}}
                  </td>
                  <td *ngFor="let knob_key_name of ordered_keys" data-toggle="tooltip" title="Click to draw plots">
                    <!-- all stage variables that we make experiment with (if strategy is not forever) -- format: [min, max]-->
                    <span *ngIf="item.number === -1 && is_included_in_experiment(knob_key_name) && experiment.executionStrategy.type !== 'forever'">
                      <b>[{{item.knobs[knob_key_name].min}} - {{item.knobs[knob_key_name].max}}]</b>
                    </span>
    
                    <!-- all stage variables that we do "not" make experiment with (if strategy is not forever) -- format: default_value -->
                    <span *ngIf="item.number === -1 && !is_included_in_experiment(knob_key_name) && experiment.executionStrategy.type !== 'forever'">
                      <b>{{item.knobs[knob_key_name].default}}</b>
                    </span>

                    <!-- all stage variables for forever strategy -- format: value -->
                    <span *ngIf="item.number === -1 && experiment.executionStrategy.type === 'forever'">
                      <b>{{item.knobs[knob_key_name]}}</b>
                    </span>


                    <span *ngIf="item.number !== -1">
                      {{item.knobs[knob_key_name]}}
                    </span>
                  </td>
                  
                </tr>
                </tbody>
                <tfoot *ngIf="available_stages.length > 3">
                <tr>
                  <td colspan="12">
                    <mfBootstrapPaginator [rowsOnPageSet]="[3,10,25,100]"></mfBootstrapPaginator>
                  </td>
                </tr>
                </tfoot>
              </table>
          </div>
        </div>
      </div>
    </div>
  `
})

export class ExperimentStagesPaginatorComponent implements OnInit {
  @Output() rowClicked: EventEmitter<any> = new EventEmitter<any>();
  @Output() scaleChanged: EventEmitter<any> = new EventEmitter<any>();
  @Output() incomingDataTypeChanged: EventEmitter<any> = new EventEmitter<any>();

  @Input() experiment: any;
  @Input() selected_stage: any;
  @Input() available_stages: any;
  @Input() targetSystem: any;
  @Input() incoming_data_type: object;
  @Input() scale: string;
  @Input() hidden: boolean;
  @Input() retrieved_data_length: number;
  @Input() for_successful_experiment: boolean;
  @Input() oedaCallback: OedaCallbackEntity;

  public selected_row: number = 0;
  public ordered_keys: any;

  @Input() onRowClick(stage) {
    this.selected_row = stage.number;
    this.rowClicked.emit(stage);
  }

  @Input() onScaleChange = (ev) => {
    this.scaleChanged.emit(ev);
  };

  @Input() onIncomingDataTypeChange = (ev) => {
    this.incomingDataTypeChanged.emit(ev);
  };

  ngOnInit() {
    // distinction between forever & non-forever strategies.
    // for forever, we get an empty knob object for all_stages at initialization,
    // so we copy first stage's knob to all_stage, as all are same for forever strategy
    if (this.experiment.executionStrategy.type === 'forever') {
      this.available_stages[0].knobs = this.available_stages[1].knobs;
    }
    this.ordered_keys = this.get_ordered_keys(this.available_stages[0].knobs);
  }

  /** returns true if given variable is being tested in the experiment */
  is_included_in_experiment(knob_key_name: string): boolean {
    let found: boolean = false;
    if (!isNullOrUndefined(this.experiment.changeableVariables)) {
      this.experiment.changeableVariables.forEach(function(ch_var) {
        if (ch_var["name"] == knob_key_name && !found) {
          found = true;
        }
      });
    }
    return found;
  }

  /** returns keys of the given object */
  get_keys(object) : Array<string> {
    if (!isNullOrUndefined(object)) {
      return Object.keys(object);
    }
    return null;
  }

  /** sorts given stage objects keys with respect to executionStrategy knob key order
   * we need this function because stage object has these keys in an unordered manner
   * https://stackoverflow.com/questions/42227582/sorting-array-based-on-another-array
   */
  get_ordered_keys(stage_object) {
    let sortingArray = [];
    this.targetSystem.defaultVariables.forEach(function(default_variable){
      sortingArray.push(default_variable['name']);
    });
    let unordered_stage_keys = this.get_keys(stage_object);
    let ordered_stage_keys = sortingArray.filter((el)=>(unordered_stage_keys.indexOf(el) > -1));
    return ordered_stage_keys;
  }
}
