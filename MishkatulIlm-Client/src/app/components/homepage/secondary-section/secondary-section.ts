import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { TopicCard, TopicCardData } from './topic-card/topic-card';

@Component({
  selector: 'app-secondary-section',
  imports: [TopicCard, NgFor],
  templateUrl: './secondary-section.html',
  styleUrl: './secondary-section.scss',
})
export class SecondarySection {
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
  ];
}
