import { Component, Input } from '@angular/core';

export type TopicCardAccent = 'green' | 'gold';
export type TopicCardIcon = 'book' | 'arabic' | 'chat';

export interface TopicCardData {
  id: string;
  title: string;
  summary: string;
  accent: TopicCardAccent;
  icon: TopicCardIcon;
}

@Component({
  selector: 'app-topic-card',
  imports: [],
  templateUrl: './topic-card.html',
  styleUrl: './topic-card.scss',
})
export class TopicCard {
  @Input({ required: true }) card!: TopicCardData;
}
