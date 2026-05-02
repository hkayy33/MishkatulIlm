import { Component, inject } from '@angular/core';
import { GetStartedBtn } from '../../components/get-started-btn/get-started-btn';
import { ProgramsSectionNavService } from '../../services/programs-section-nav.service';

@Component({
  selector: 'app-nav-bar',
  imports: [GetStartedBtn],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private readonly programsNav = inject(ProgramsSectionNavService);

  onProgramsClick(): void {
    this.programsNav.scrollToProgramsSection();
  }

  onProgramsKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this.onProgramsClick();
    }
  }
}
