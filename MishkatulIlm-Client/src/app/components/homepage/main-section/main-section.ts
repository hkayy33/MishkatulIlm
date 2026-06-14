import { Component } from '@angular/core';
import { GetStartedBtn } from '../../get-started-btn/get-started-btn';

export interface TopicCard {
  id: string;
  title: string;
  summary: string;
}

@Component({
  selector: 'app-main-section',
  imports: [GetStartedBtn],
  templateUrl: './main-section.html',
  styleUrl: './main-section.scss',
})
export class MainSection {
  readonly topicCards: TopicCard[] = [
    {
      id: 'quran',
      title: 'Quran recitation',
      summary:
        'Build fluency in reading and reciting the Quran with structured practice and gentle correction.',
    },
    {
      id: 'arabic',
      title: 'Arabic foundations',
      summary:
        'Learn letters, joining, and core vocabulary so you can understand the language behind the Quran.',
    },
    {
      id: 'quran-memorisation',
      title: 'Quran memorization',
      summary:
        'Commit portions of the Quran to memory with guided revision, correction, and a steady plan.',
    },
  ];
}
