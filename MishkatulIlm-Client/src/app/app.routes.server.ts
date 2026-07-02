import { RenderMode, ServerRoute } from '@angular/ssr';
import { COURSE_CATALOG } from './core/data/course-catalog.data';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'courses/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () =>
      COURSE_CATALOG.map((course) => ({ slug: course.slug })),
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
