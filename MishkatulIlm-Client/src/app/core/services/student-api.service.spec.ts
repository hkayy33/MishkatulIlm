import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { StudentApiService } from './student-api.service';

describe('StudentApiService Stripe Checkout', () => {
  let api: StudentApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test' },
      ],
    });
    api = TestBed.inject(StudentApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('initiates the authenticated statement checkout at the Stripe endpoint', () => {
    let response: unknown;
    api.createStripeCheckout().subscribe((value) => (response = value));

    const request = http.expectOne('https://api.test/api/student/stripe-checkout');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ checkoutUrl: 'https://checkout.stripe.test/session', submissionId: 's1', reference: 'r1', status: 'pending_verification' });
    expect(response).toEqual({
      checkoutUrl: 'https://checkout.stripe.test/session',
      submissionId: 's1',
      reference: 'r1',
      status: 'pending_verification',
    });
  });
});
