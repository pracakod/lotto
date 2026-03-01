
import { Component, signal, inject, computed, effect } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { LottoStatsService, GameType } from './services/lotto-stats.service';
import { GeminiService } from './services/gemini.service';
import { HistogramComponent } from './components/histogram.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HistogramComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  lottoService = inject(LottoStatsService);
  geminiService = inject(GeminiService);

  // UI State - Added 'results'
  currentView = signal<'analyze' | 'history' | 'settings' | 'results'>('analyze');
  isManualMode = signal(false);
  visualizationMode = signal<'bars' | 'heatmap'>('bars');
  
  // Theme & Fullscreen State
  isDarkMode = signal(true);
  isFullscreen = signal(false);

  // History Filter State
  historyFilter = signal<'all' | GameType>('all');
  
  // Real Check Mode State (in History)
  isCheckMode = signal(false);
  winningNumbersSelection = signal<Set<number>>(new Set());
  winningBonusSelection = signal<Set<number>>(new Set());
  
  // Results Tab State
  isAddingResult = signal(false);
  newResultSelection = signal<Set<number>>(new Set());
  newResultBonusSelection = signal<Set<number>>(new Set());
  
  // Multi Multi Specific State
  multiBetSize = signal<number>(10); // Default to 10 numbers

  // Import Data State
  importText = signal('');
  importSuccess = signal(false);

  // AI Logic State
  loading = signal(false);
  prediction = signal<number[]>([]);
  predictionBonus = signal<number[]>([]);
  logicSteps = signal<string[]>([]);
  aiExplanation = signal<string>('');
  
  // Manual Entry State
  manualNumbers = signal<Set<number>>(new Set());
  manualBonusNumbers = signal<Set<number>>(new Set());
  
  // Feedback state
  linkCopied = signal(false);

  constructor() {
    // Effect to handle Dark Mode class on HTML element
    effect(() => {
      const html = document.documentElement;
      if (this.isDarkMode()) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    });

    // Listen to fullscreen changes to update state if user uses ESC key
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen.set(!!document.fullscreenElement);
    });
  }

  // Computed helper for MAIN grid generation
  gridNumbers = computed(() => {
    return Array.from({ length: this.lottoService.activeGameConfig().totalNumbers }, (_, i) => i + 1);
  });

  // Computed helper for BONUS grid generation (Eurojackpot)
  bonusGridNumbers = computed(() => {
    const max = this.lottoService.activeGameConfig().bonusTotalNumbers || 0;
    return Array.from({ length: max }, (_, i) => i + 1);
  });
  
  // Determine how many numbers user should pick
  requiredSelectionCount = computed(() => {
      if (this.lottoService.activeGameId() === 'multi') {
          return this.multiBetSize();
      }
      return this.lottoService.activeGameConfig().drawSize;
  });

  isManualComplete = computed(() => {
    const config = this.lottoService.activeGameConfig();
    const mainOk = this.manualNumbers().size === this.requiredSelectionCount();
    const bonusOk = config.bonusDrawSize ? this.manualBonusNumbers().size === config.bonusDrawSize : true;
    return mainOk && bonusOk;
  });

  // For Checking Mode
  isWinningSelectionComplete = computed(() => {
    const config = this.lottoService.activeGameConfig();
    const mainOk = this.winningNumbersSelection().size === config.drawSize;
    const bonusOk = config.bonusDrawSize ? this.winningBonusSelection().size === config.bonusDrawSize : true;
    return mainOk && bonusOk;
  });
  
  // For New Result Mode
  isNewResultComplete = computed(() => {
    const config = this.lottoService.activeGameConfig();
    const mainOk = this.newResultSelection().size === config.drawSize;
    const bonusOk = config.bonusDrawSize ? this.newResultBonusSelection().size === config.bonusDrawSize : true;
    return mainOk && bonusOk;
  });

  // Filtered Coupons for History View
  filteredCoupons = computed(() => {
    const all = this.lottoService.savedCoupons();
    const filter = this.historyFilter();
    if (filter === 'all') return all;
    return all.filter(c => c.gameId === filter);
  });

  // Dashboard Stats Helpers
  topHotNumbers = computed(() => {
    return [...this.lottoService.stats()]
      .filter(s => s.status === 'hot')
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  topColdNumbers = computed(() => {
    return [...this.lottoService.stats()]
      .filter(s => s.status === 'cold')
      .sort((a, b) => a.count - b.count) // asc count
      .slice(0, 5);
  });

  oddEvenRatio = computed(() => {
    const hot = this.topHotNumbers();
    if (hot.length === 0) return '50/50';
    const odd = hot.filter(n => n.number % 2 !== 0).length;
    const even = hot.length - odd;
    return `${odd} (NP) / ${even} (P)`;
  });

  toggleTheme() {
    this.isDarkMode.update(v => !v);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
  
  toggleVisualizationMode(mode: 'bars' | 'heatmap') {
      this.visualizationMode.set(mode);
  }
  
  setMultiBetSize(size: number) {
      this.multiBetSize.set(size);
      // Clear manual selection if size changes to prevent invalid state
      this.manualNumbers.set(new Set());
  }

  switchGame(gameId: GameType) {
    this.lottoService.setGame(gameId);
    this.resetState();
    this.isCheckMode.set(false);
    this.winningNumbersSelection.set(new Set());
    this.winningBonusSelection.set(new Set());
    this.newResultSelection.set(new Set());
    this.newResultBonusSelection.set(new Set());
    
    // Default multi size to 10 when switching to it
    if(gameId === 'multi') this.multiBetSize.set(10);
  }

  toggleManualMode() {
    this.isManualMode.update(v => !v);
    this.manualNumbers.set(new Set());
    this.manualBonusNumbers.set(new Set());
  }

  // Toggle for the Real Check Mode in History
  toggleCheckMode() {
    this.isCheckMode.update(v => !v);
    this.winningNumbersSelection.set(new Set());
    this.winningBonusSelection.set(new Set());
  }
  
  toggleAddingResult() {
      this.isAddingResult.update(v => !v);
      this.newResultSelection.set(new Set());
      this.newResultBonusSelection.set(new Set());
  }

  setHistoryFilter(filter: 'all' | GameType) {
    this.historyFilter.set(filter);
  }

  toggleManualNumber(num: number) {
    const current = new Set(this.manualNumbers());
    const limit = this.requiredSelectionCount();
    
    if (current.has(num)) current.delete(num);
    else if (current.size < limit) current.add(num);
    this.manualNumbers.set(current);
  }

  toggleManualBonusNumber(num: number) {
    const current = new Set(this.manualBonusNumbers());
    const limit = this.lottoService.activeGameConfig().bonusDrawSize || 0;
    if (current.has(num)) current.delete(num);
    else if (current.size < limit) current.add(num);
    this.manualBonusNumbers.set(current);
  }

  toggleWinningNumber(num: number) {
    const current = new Set(this.winningNumbersSelection());
    const limit = this.lottoService.activeGameConfig().drawSize;
    if (current.has(num)) current.delete(num);
    else if (current.size < limit) current.add(num);
    this.winningNumbersSelection.set(current);
  }

  toggleWinningBonusNumber(num: number) {
    const current = new Set(this.winningBonusSelection());
    const limit = this.lottoService.activeGameConfig().bonusDrawSize || 0;
    if (current.has(num)) current.delete(num);
    else if (current.size < limit) current.add(num);
    this.winningBonusSelection.set(current);
  }
  
  toggleNewResultNumber(num: number) {
      const current = new Set(this.newResultSelection());
      const limit = this.lottoService.activeGameConfig().drawSize;
      if (current.has(num)) current.delete(num);
      else if (current.size < limit) current.add(num);
      this.newResultSelection.set(current);
  }
  
  toggleNewResultBonusNumber(num: number) {
      const current = new Set(this.newResultBonusSelection());
      const limit = this.lottoService.activeGameConfig().bonusDrawSize || 0;
      if (current.has(num)) current.delete(num);
      else if (current.size < limit) current.add(num);
      this.newResultBonusSelection.set(current);
  }
  
  saveNewResult() {
      if(this.isNewResultComplete()) {
          this.lottoService.addManualDraw(
              Array.from(this.newResultSelection()),
              Array.from(this.newResultBonusSelection())
          );
          this.isAddingResult.set(false);
          this.newResultSelection.set(new Set());
          this.newResultBonusSelection.set(new Set());
      }
  }

  saveManualCoupon() {
    if (this.isManualComplete()) {
      this.lottoService.saveCoupon(
          Array.from(this.manualNumbers()), 
          Array.from(this.manualBonusNumbers()),
          'manual'
      );
      this.currentView.set('history');
      this.isManualMode.set(false);
      this.manualNumbers.set(new Set());
      this.manualBonusNumbers.set(new Set());
    }
  }

  confirmRealCheck() {
    if (this.isWinningSelectionComplete()) {
      this.lottoService.checkCouponsAgainstRealNumbers(
          Array.from(this.winningNumbersSelection()),
          Array.from(this.winningBonusSelection())
      );
      this.isCheckMode.set(false);
      this.winningNumbersSelection.set(new Set());
      this.winningBonusSelection.set(new Set());
    }
  }

  onPasteResults(event: ClipboardEvent) {
    const clipboardData = event.clipboardData;
    const pastedText = clipboardData?.getData('text') || '';
    
    // Parse numbers
    const numbers = pastedText.split(/[\s,]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    const config = this.lottoService.activeGameConfig();
    const newMain = new Set<number>();
    const newBonus = new Set<number>();
    
    // Simple logic: Fill Main first, then Bonus if Eurojackpot
    let i = 0;
    // Fill Main
    while(newMain.size < config.drawSize && i < numbers.length) {
        const n = numbers[i++];
        if (n >= 1 && n <= config.totalNumbers) newMain.add(n);
    }

    // Fill Bonus (if applicable)
    if (config.bonusTotalNumbers) {
        while(newBonus.size < (config.bonusDrawSize || 0) && i < numbers.length) {
            const n = numbers[i++];
             if (n >= 1 && n <= config.bonusTotalNumbers) newBonus.add(n);
        }
    }

    if (newMain.size > 0) this.winningNumbersSelection.set(newMain);
    if (newBonus.size > 0) this.winningBonusSelection.set(newBonus);
  }

  onImportTextChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.importText.set(target.value);
  }

  processImport() {
    const success = this.lottoService.processImportedData(this.importText());
    if (success) {
        this.importSuccess.set(true);
        this.importText.set('');
        setTimeout(() => this.importSuccess.set(false), 3000);
        this.currentView.set('analyze');
    } else {
        alert('Nie udało się zaimportować danych. Sprawdź format.');
    }
  }

  private resetState() {
    this.prediction.set([]);
    this.predictionBonus.set([]);
    this.logicSteps.set([]);
    this.aiExplanation.set('');
    this.manualNumbers.set(new Set());
    this.manualBonusNumbers.set(new Set());
    this.isManualMode.set(false);
  }

  async generatePrediction() {
    this.loading.set(true);
    this.prediction.set([]); 
    this.predictionBonus.set([]);
    this.aiExplanation.set('');
    this.logicSteps.set([]);
    this.isManualMode.set(false);

    await new Promise(resolve => setTimeout(resolve, 600));

    // Pass the multi bet size if applicable
    const result = this.lottoService.generateSmartPrediction(
        this.lottoService.activeGameId() === 'multi' ? this.multiBetSize() : undefined
    );
    
    this.prediction.set(result.numbers);
    this.predictionBonus.set(result.bonusNumbers);
    this.logicSteps.set(result.logic);
    this.loading.set(false);

    let contextString = result.numbers.join(', ');
    if (result.bonusNumbers.length > 0) {
        contextString += ` + (Bonus: ${result.bonusNumbers.join(', ')})`;
    }

    const explanation = await this.geminiService.explainPrediction(
      result.numbers, 
      this.lottoService.stats(),
      this.lottoService.activeGameConfig().name
    );
    
    this.aiExplanation.set(explanation);
  }

  saveCurrentPrediction() {
    if (this.prediction().length > 0) {
      this.lottoService.saveCoupon(this.prediction(), this.predictionBonus(), 'ai');
      this.currentView.set('history');
    }
  }

  clearHistory() {
    if (confirm('Czy na pewno chcesz usunąć całą historię kuponów?')) {
      this.lottoService.clearHistory();
    }
  }

  shareApp() {
    const url = window.location.href;
    const shareData = {
      title: 'Lotto Data Scientist',
      text: 'Sprawdź swoje szanse w Lotto z analizą AI!',
      url: url
    };
    if (navigator.share) {
      navigator.share(shareData).catch((err) => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.linkCopied.set(true);
        setTimeout(() => this.linkCopied.set(false), 2000);
      });
    }
  }
}
