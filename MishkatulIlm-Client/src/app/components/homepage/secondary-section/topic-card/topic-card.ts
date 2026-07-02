import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CourseCatalogEntry } from '../../../../core/data/course-catalog.data';

export type TopicCardData = Pick<
  CourseCatalogEntry,
  'slug' | 'title' | 'titleArabic' | 'overlayTitle' | 'summary' | 'image'
>;

@Component({
  selector: 'app-topic-card',
  imports: [RouterLink],
  templateUrl: './topic-card.html',
  styleUrl: './topic-card.scss',
})
export class TopicCard {
  @Input({ required: true }) card!: TopicCardData;
}
