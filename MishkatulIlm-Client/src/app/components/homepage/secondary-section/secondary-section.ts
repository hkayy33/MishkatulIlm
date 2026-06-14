import { Component, DestroyRef, HostListener, afterNextRender, effect, inject, signal } from '@angular/core';
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
  protected readonly selectedTopic = signal<TopicCardData | null>(null);

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

    effect((onCleanup) => {
      const open = this.selectedTopic() !== null;
      if (typeof document === 'undefined') {
        return;
      }

      document.body.style.overflow = open ? 'hidden' : '';
      onCleanup(() => {
        document.body.style.overflow = '';
      });
    });
  }

  readonly topic: TopicCardData[] = [
    {
      id: 'quran',
      title: 'Quran Recitation with tajweed',
      summary: 'Learn to read the Quran beautifully with proper pronunciation.',
      details:
        'Start from the Arabic alphabet or strengthen existing reading skills with one-on-one guidance. Lessons focus on correct letter articulation (makhraj), smooth flow between words, and building confidence reciting from the mushaf at your own pace.',
      accent: 'green',
      icon: 'book',
    },
    {
      id: 'quran-memorisation',
      title: 'Quran Memorization /',
      titleArabic: 'حفظ القرآن',
      summary:
        'Commit portions of the Quran to memory with guided revision, correction, and a steady plan.',
      details:
        'Work through hifz at your own pace with a dedicated tutor who supports memorization, revision (muraja\'ah), and retention. Lessons include clear targets, regular review of previous portions, and guidance on proper recitation as you memorize.',
      accent: 'gold',
      icon: 'arabic',
    },
    {
      id: 'arabic',
      title: 'Arabic Language',
      summary: 'Build a strong foundation in Arabic and communicate with ease.',
      details:
        'Develop reading, writing, and conversational Arabic through tailored lessons in grammar (nahw), morphology (sarf), and vocabulary. Ideal for students who want to understand the Quran more deeply or communicate in everyday Arabic.',
      accent: 'green',
      icon: 'chat',
    },
    {
      id: 'quran-mastery',
      title: 'Quran Recitation Mastery',
      summary:
        'Advance from fluency to mastery with focused coaching on voice, rhythm, and precision.',
      details:
        'For students who already read comfortably and want to refine their recitation further. Work on tone, rhythm, breath control, and precision with a teacher who helps you polish your delivery and consistency.',
      accent: 'gold',
      icon: 'arabic',
    },
    {
      id: 'islamic-studies',
      title: 'Islamic Studies Course',
      summary:
        'Explore core beliefs, worship, and life guidance through structured lessons and discussion.',
      details:
        'Cover essential topics such as aqeedah, fiqh basics, seerah, and daily Islamic practice through structured lessons and discussion. Content is adapted to your background, age, and learning goals.',
      accent: 'green',
      icon: 'book',
    },
    {
      id: 'islamic-inheritance',
      title: 'Islamic Inheritance Law',
      summary:
        'Learn the rules of Islamic inheritance and estate division with clear examples and practical application.',
      details:
        'Understand the principles of faraid (Islamic inheritance) with step-by-step explanations and practical examples. Learn how shares are calculated and applied so you can study the topic with clarity and confidence.',
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

  openTopic(card: TopicCardData): void {
    this.selectedTopic.set(card);
  }

  closeTopic(): void {
    this.selectedTopic.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedTopic()) {
      this.closeTopic();
    }
  }
}
