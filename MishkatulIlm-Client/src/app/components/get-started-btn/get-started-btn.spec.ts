import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GetStartedBtn } from './get-started-btn';

describe('GetStartedBtn', () => {
  let component: GetStartedBtn;
  let fixture: ComponentFixture<GetStartedBtn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GetStartedBtn]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GetStartedBtn);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
