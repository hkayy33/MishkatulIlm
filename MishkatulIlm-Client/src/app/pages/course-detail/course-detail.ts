import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { getCourseBySlug } from '../../core/data/course-catalog.data';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetail {
  private readonly route = inject(ActivatedRoute);

  protected readonly course = toSignal(
    this.route.paramMap.pipe(map((params) => getCourseBySlug(params.get('slug') ?? '') ?? null)),
    { initialValue: null },
  );
}
