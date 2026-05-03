import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, merge, of } from 'rxjs';
import { GetStartedBtn } from '../../components/get-started-btn/get-started-btn';
import { ProgramsSectionNavService } from '../../services/programs-section-nav.service';

@Component({
  selector: 'app-nav-bar',
  imports: [GetStartedBtn, RouterLink],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private readonly router = inject(Router);
  private readonly programsNav = inject(ProgramsSectionNavService);

  /** White nav links on home hero; dark links on other routes (e.g. legal pages). */
  readonly isHomeRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => this.pathIsHome(this.router.url))),
    { initialValue: this.pathIsHome(this.router.url) },
  );

  private pathIsHome(url: string): boolean {
    const path = url.split('#')[0].split('?')[0];
    return path === '/' || path === '';
  }

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
