import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBar } from './shared/nav-bar/nav-bar';
import { Footer } from './shared/footer/footer';
import { Homepage } from './components/homepage/homepage';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavBar, Footer, Homepage],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('MishkatulIlm-Client');
}
