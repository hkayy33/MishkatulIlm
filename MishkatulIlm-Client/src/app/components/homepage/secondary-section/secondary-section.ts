import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgFor, NgIf } from '@angular/common';
import { TopicCard, TopicCardData } from './topic-card/topic-card';
import { ProgramsSectionNavService } from '../../../services/programs-section-nav.service';
import { COURSE_CATALOG } from '../../../core/data/course-catalog.data';

@Component({
  selector: 'app-secondary-section',
  imports: [TopicCard, NgFor, NgIf],
  templateUrl: './secondary-section.html',
  styleUrl: './secondary-section.scss',
})
export class SecondarySection {
  private static readonly topicPreviewCount = 3;

  /** Delay expanding topics until smooth scroll has mostly finished (ms). */
  private static readonly scrollThenExpandDelayMs = 520;

  protected readonly showAllTopics = signal(false);

  readonly topic: TopicCardData[] = COURSE_CATALOG.map(
    ({ slug, title, titleArabic, overlayTitle, summary, image }) => ({
      slug,
      title,
      titleArabic,
      overlayTitle,
      summary,
      image,
    }),
  );

  constructor() {
    const programsNav = inject(ProgramsSectionNavService);
    const destroyRef = inject(DestroyRef);

    programsNav.requests$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      document.getElementById('what-we-offer')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      window.setTimeout(() => {
        if (this.topicsExtra.length) {
          this.showAllTopics.set(true);
        }
      }, SecondarySection.scrollThenExpandDelayMs);
    });

    afterNextRender(() => {
      programsNav.fulfillPendingScrollIfNeeded();
    });
  }

  get topicsPrimary(): TopicCardData[] {
    return this.topic.slice(0, SecondarySection.topicPreviewCount);
  }

  get topicsExtra(): TopicCardData[] {
    return this.topic.slice(SecondarySection.topicPreviewCount);
  }

  toggleTopics(): void {
    this.showAllTopics.update((v) => !v);
  }
}
