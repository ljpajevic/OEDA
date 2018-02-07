import {Component} from '@angular/core';
import {LayoutService} from "../../shared/modules/helper/layout.service";

@Component({
  selector: 'control-dashboard',
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {

  constructor(private layout: LayoutService) {
    this.layout.setHeader("Dashboard", "OEDA Control Overview")
  }

}
