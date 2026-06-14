import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgFor, NgIf } from '@angular/common';
import { TopicCard, TopicCardData } from './topic-card/topic-card';
import { ProgramsSectionNavService } from '../../../services/programs-section-nav.service';

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

  /** Use `topic` as the template source name if you prefer: `*ngFor="let card of topic"` */
  readonly topic: TopicCardData[] = [
    {
      id: 'quran',
      title: 'Quran Recitation',
      summary:
        'Learn to read the Quran beautifully with proper pronunciation.',
      accent: 'green',
      icon: 'book',
    },
    {
      id: 'tajweed',
      title: 'Tajweed',
      summary:
        'Master the rules of Tajweed to recite with accuracy and confidence.',
      accent: 'gold',
      icon: 'arabic',
    },
    {
      id: 'arabic',
      title: 'Arabic Language',
      summary:
        'Build a strong foundation in Arabic and communicate with ease.',
      accent: 'green',
      icon: 'chat',
    },
    {
      id: 'quran-mastery',
      title: 'Quran Recitation Mastery',
      summary:
        'Advance from fluency to mastery with focused coaching on voice, rhythm, and precision.',
      accent: 'gold',
      icon: 'arabic',
    },
    {
      id: 'islamic-studies',
      title: 'Islamic Studies Course',
      summary:
        'Explore core beliefs, worship, and life guidance through structured lessons and discussion.',
      accent: 'green',
      icon: 'book',
    },
    {
      id: 'islamic-inheritance',
      title: 'Islamic Inheritance Law',
      summary:
        'Learn the rules of Islamic inheritance and estate division with clear examples and practical application.',
      accent: 'gold',
      icon: 'book',
    },
  ];

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
