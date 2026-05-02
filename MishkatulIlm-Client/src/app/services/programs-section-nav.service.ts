import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Signals navbar “Programs” → scroll to What We Offer and reveal expanded topics. */
@Injectable({ providedIn: 'root' })
export class ProgramsSectionNavService {
  private readonly requests = new Subject<void>();

  readonly requests$ = this.requests.asObservable();

  scrollToProgramsSection(): void {
    this.requests.next();
  }
}
