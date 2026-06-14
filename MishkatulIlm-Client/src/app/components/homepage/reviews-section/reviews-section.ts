import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';

interface Review {
  id: string;
  name: string;
  date?: string;
  rating: number;
  text: string;
}

@Component({
  selector: 'app-reviews-section',
  imports: [],
  templateUrl: './reviews-section.html',
  styleUrl: './reviews-section.scss',
})
export class ReviewsSection {
  private static readonly autoplayMs = 6000;

  private readonly destroyRef = inject(DestroyRef);
  private autoplayTimer: ReturnType<typeof setInterval> | null = null;
  private autoplayPaused = false;

  protected readonly reviews: Review[] = [
    {
      id: 'todd',
      name: 'Todd',
      rating: 5,
      text: 'Learning with Ustadh Ibraheem has been an amazing experience. His Qur’an recitation is so clear and melodious, and he explains everything in a way that’s easy to understand. He’s patient, dedicated, and makes every lesson meaningful. I really recommend him.',
    },
    {
      id: 'naveed',
      name: 'Naveed',
      date: 'December 3, 2024',
      rating: 5,
      text: 'MashAllah sheikh Ibraheem is very big on tajweed, he is extremely encouraging and helpful. The first lesson or two he will find your shortcomings in tajweed and he will work with you on those specific issues in order to perfect it. Jazakallah khairan ya sheikh may Allah swt reward you for your dedication and lack of sleep in order for us in America to learn the book of Allah swt. May Allah swt raise your ranks in Al Firdous Al Ala ameen.',
    },
    {
      id: 'maya-victor',
      name: 'Maya and Victor',
      date: 'October 18, 2025',
      rating: 5,
      text: 'My kids absolutely love Ustaadh Ibraheem! He’s such a dedicated and compassionate teacher. He taught them Arabic and the Quran, and always took the time to help with their homework. He’s patient, kind, and truly cares about his students. I really appreciate how he uses both English and Arabic to make lessons easier to understand. My kids are 11 and 12, and they’ve learned so much from him. Highly recommended! Thank you truly.',
    },
    {
      id: 'umer',
      name: 'Umer',
      date: 'October 21, 2025',
      rating: 5,
      text: 'Alhamdulillah I have been learning Tajweed and doing Hifz with Ustaz (Teacher) Ibraheem. Ma Sha Allah I am so grateful to find such a unique teacher. A hafiz, scholar and friendly Mentor. Very flexible, accommodating and kind. I will be soon starting Tafseer (Quranic Exegesis) with him. May Allah increase in his knowledge. Amin. It is a blessing to have access to teachers like him. Alhamdullillah.',
    },
    {
      id: 'amina',
      name: 'Amina',
      date: 'November 10, 2025',
      rating: 5,
      text: 'Sheikh Ibraheem Ilyas is a very nice and organised teacher. He helps me understand the meaning, and memorize the verses very well and I highly recommend sheikh Ibraheem and I thank sheikh Ibraheem for being my teacher. بارك الله فيكم.',
    },
    {
      id: 'hassan',
      name: 'Hassan',
      rating: 5,
      text: 'Amazing tutor, teaching style is amazing, very structured and helpful, has a lot of patience and knowledge, learnt a lot in my trial lesson, excited to start my journey with Ustadh.',
    },
  ];

  protected readonly currentIndex = signal(0);

  protected readonly activeReview = computed(() => this.reviews[this.currentIndex()]);

  constructor() {
    afterNextRender(() => {
      this.startAutoplay();
    });

    this.destroyRef.onDestroy(() => {
      this.stopAutoplay();
    });
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected goTo(index: number): void {
    const total = this.reviews.length;
    this.currentIndex.set(((index % total) + total) % total);
  }

  protected next(): void {
    this.goTo(this.currentIndex() + 1);
  }

  protected prev(): void {
    this.goTo(this.currentIndex() - 1);
  }

  protected onCarouselKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    }
  }

  protected pauseAutoplay(): void {
    this.autoplayPaused = true;
  }

  protected resumeAutoplay(): void {
    this.autoplayPaused = false;
  }

  private startAutoplay(): void {
    this.stopAutoplay();
    this.autoplayTimer = setInterval(() => {
      if (!this.autoplayPaused) {
        this.next();
      }
    }, ReviewsSection.autoplayMs);
  }

  private stopAutoplay(): void {
    if (this.autoplayTimer !== null) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
}
