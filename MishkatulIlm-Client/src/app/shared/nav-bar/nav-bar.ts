import { Component } from '@angular/core';
import { GetStartedBtn } from '../../components/get-started-btn/get-started-btn';

@Component({
  selector: 'app-nav-bar',
  imports: [GetStartedBtn],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {

}
