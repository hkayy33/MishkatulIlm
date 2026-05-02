import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-get-started-btn',
  imports: [],
  templateUrl: './get-started-btn.html',
  styleUrl: './get-started-btn.scss',
})
export class GetStartedBtn {
  @Input() label = 'Get Started';
  @Input() variant: 'primary' | 'outline' = 'primary';
}
