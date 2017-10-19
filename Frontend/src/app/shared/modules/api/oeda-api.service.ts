import {Injectable} from "@angular/core";
import {NotificationsService} from "angular2-notifications";
import {AuthHttp} from "angular2-jwt";
import {Http} from "@angular/http";
import {RESTService} from "../../util/rest-service";
import {LoggerService} from "../helper/logger.service";
import {environment} from "../../../../environments/environment";
import {Observable} from "rxjs/Observable";


@Injectable()
export class OEDAApiService extends RESTService {

  constructor(http: Http, authHttp: AuthHttp, notify: NotificationsService, log: LoggerService) {
    super(http, authHttp, notify, log);
  }

  public loadAllExperiments(): Observable<Experiment[]> {
    return this.doGETPublicRequest("/experiments")
  }

  public loadExperimentById(id: string): Observable<Experiment> {
    return this.doGETPublicRequest("/experiments/" + id)
  }

  public saveExperiment(experiment: Experiment): Observable<any> {
    return this.doPOSTRequest("/experiments/" + experiment.id, experiment)
  }


  public loadAllDefinitions(): Observable<Definition[]> {
    return this.doGETPublicRequest("/definitions")
  }

  public loadDefinitionsById(id: string): Observable<Definition> {
    return this.doGETPublicRequest("/definitions/" + id)
  }

  public saveDefinitions(definition: Definition): Observable<any> {
    return this.doPOSTRequest("/definitions/" + definition.id, definition)
  }

  public loadAllTargets(): Observable<Target[]> {
    return this.doGETPublicRequest("/targets")
  }

  public loadTargetById(id: string): Observable<Target> {
    return this.doGETPublicRequest("/targets/" + id)
  }

  public saveTarget(target: Target): Observable<any> {
    return this.doPOSTPublicRequest("/targets/" + target.id, target)
  }

}


export interface Experiment {
  id: string,
  name: string,
  status: string
}


export interface Definition {
  id: string,
  name: string
}


export interface Target {
  id: string,
  name: string,
  status: string,
  description: string,
  primaryDataProvider: any,
  changeProvider: any,
  incomingDataTypes: any,
  changeableVariable: any
}