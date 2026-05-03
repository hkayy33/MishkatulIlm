import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-get-started-btn',
  imports: [RouterLink],
  templateUrl: './get-started-btn.html',
  styleUrl: './get-started-btn.scss',
  host: {
    '[class.size-large]': 'size === "large"',
  },
})
export class GetStartedBtn {
  @Input() label = 'Get Started';
  @Input() variant: 'primary' | 'outline' = 'primary';
  /** Larger tap target and typography for prominent placements. */
  @Input() size: 'default' | 'large' = 'default';
}
