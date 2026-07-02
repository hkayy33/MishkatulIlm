import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopicCard } from './topic-card';

describe('TopicCard', () => {
  let component: TopicCard;
  let fixture: ComponentFixture<TopicCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopicCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopicCard);
    fixture.componentRef.setInput('card', {
      slug: 'quran-tajweed',
      title: 'Test',
      titleArabic: 'اختبار',
      summary: 'Summary',
      image: '/offers/quran-tajweed.png',
    });
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
