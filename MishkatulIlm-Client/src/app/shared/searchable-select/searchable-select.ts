import {
  Component,
  computed,
  effect,
  input,
  model,
  signal,
} from '@angular/core';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.html',
  styleUrl: './searchable-select.scss',
})
export class SearchableSelect {
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();
  readonly options = input<SearchableSelectOption[]>([]);
  readonly placeholder = input('Type to search…');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly maxResults = input(50);
  readonly autocomplete = input<string | null>(null);

  readonly value = model<string>('');

  protected readonly searchQuery = signal('');
  protected readonly open = signal(false);
  protected readonly highlightedIndex = signal(0);

  protected readonly listboxId = `searchable-list-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly filteredOptions = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const opts = this.options().filter((o) => o.value.length > 0);
    const matched = q
      ? opts.filter((o) => o.label.toLowerCase().includes(q))
      : opts;
    return matched.slice(0, this.maxResults());
  });

  constructor() {
    effect(() => {
      const selected = this.options().find((o) => o.value === this.value());
      if (selected && this.searchQuery() !== selected.label) {
        this.searchQuery.set(selected.label);
      } else if (!this.value() && !this.open()) {
        this.searchQuery.set('');
      }
    });
  }

  protected onInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
    this.open.set(true);
    this.highlightedIndex.set(0);
    const selected = this.options().find((o) => o.value === this.value());
    if (!query.trim() || (selected && query !== selected.label)) {
      this.value.set('');
    }
  }

  protected onFocus(): void {
    if (this.disabled() || this.loading()) return;
    this.open.set(true);
    this.highlightedIndex.set(0);
  }

  protected onBlur(): void {
    window.setTimeout(() => {
      this.open.set(false);
      this.commitQuery();
    }, 150);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.disabled() || this.loading()) return;

    const items = this.filteredOptions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      if (items.length === 0) return;
      this.highlightedIndex.update((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      this.highlightedIndex.update((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (!this.open() || items.length === 0) return;
      event.preventDefault();
      const idx = this.highlightedIndex();
      const opt = items[idx] ?? items[0];
      if (opt) this.selectOption(opt);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.open.set(false);
      this.syncQueryToValue();
    }
  }

  protected selectOption(opt: SearchableSelectOption, event?: Event): void {
    event?.preventDefault();
    this.value.set(opt.value);
    this.searchQuery.set(opt.label);
    this.open.set(false);
  }

  protected isHighlighted(index: number): boolean {
    return this.open() && this.highlightedIndex() === index;
  }

  private commitQuery(): void {
    const q = this.searchQuery().trim();
    const opts = this.options().filter((o) => o.value.length > 0);
    const exact = opts.find((o) => o.label.toLowerCase() === q.toLowerCase());
    if (exact) {
      this.selectOption(exact);
      return;
    }
    this.syncQueryToValue();
  }

  private syncQueryToValue(): void {
    const selected = this.options().find((o) => o.value === this.value());
    this.searchQuery.set(selected?.label ?? '');
  }
}
