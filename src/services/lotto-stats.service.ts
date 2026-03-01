
import { Injectable, signal, computed, effect } from '@angular/core';

export type GameType = 'lotto' | 'mini' | 'euro' | 'multi';
// Removed 'simulation' and 'real_history' to focus on the 5-year expert system
export type DataSource = 'manual' | 'custom_import' | 'expert_trend';

export interface GameConfig {
  id: GameType;
  name: string;
  totalNumbers: number;
  drawSize: number; // Number of balls drawn by machine
  // Optional configuration for bonus numbers (Eurojackpot)
  bonusTotalNumbers?: number;
  bonusDrawSize?: number;
  color: string;
}

export interface NumberStat {
  number: number;
  count: number;
  frequency: number; // percentage
  status: 'hot' | 'neutral' | 'cold';
}

export interface Coupon {
  id: string;
  type: 'ai' | 'manual';
  date: Date;
  gameId: GameType;
  gameName: string;
  numbers: number[];       // Main numbers
  bonusNumbers: number[];  // Euro numbers
  drawResult: number[] | null; // Main draw
  bonusDrawResult: number[] | null; // Bonus draw
  matches: number | null;
  bonusMatches: number | null;
  isRealCheck?: boolean;
}

export interface PastDraw {
  date: string;
  numbers: number[];
  bonusNumbers: number[];
}

@Injectable({
  providedIn: 'root'
})
export class LottoStatsService {
  
  readonly games: GameConfig[] = [
    { id: 'lotto', name: 'Lotto', totalNumbers: 49, drawSize: 6, color: 'text-yellow-500' },
    { id: 'mini', name: 'Mini Lotto', totalNumbers: 42, drawSize: 5, color: 'text-blue-400' },
    { 
      id: 'euro', 
      name: 'Eurojackpot', 
      totalNumbers: 50, 
      drawSize: 5, 
      bonusTotalNumbers: 12, 
      bonusDrawSize: 2, 
      color: 'text-orange-500' 
    },
    { id: 'multi', name: 'Multi Multi', totalNumbers: 80, drawSize: 20, color: 'text-purple-500' }
  ];

  /**
   * EXPERT KNOWLEDGE BASE (2021-2025 Trends)
   * Specific to Polish Lotto (1-49).
   */
  private readonly EXPERT_DATA_LOTTO = {
    hot: [4, 30, 14, 2, 44, 24],
    cold: [43, 48, 33, 1],
    pairs: [[4, 30], [17, 21], [24, 29], [15, 25]]
  };

  /**
   * EXPERT KNOWLEDGE BASE (2021-2025 Trends)
   * Specific to Mini Lotto (1-42).
   */
  private readonly EXPERT_DATA_MINI = {
    hot: [21, 28, 4, 36, 30, 6],
    cold: [14, 20, 25],
    pairs: [[21, 30], [6, 28], [28, 36]]
  };

  /**
   * EXPERT KNOWLEDGE BASE (2021-2026 Trends)
   * Specific to Eurojackpot (5/50 + 2/12).
   */
  private readonly EXPERT_DATA_EURO = {
    // Main Numbers (1-50)
    hotMain: [34, 49, 20, 7, 35],
    coldMain: [48, 2, 5, 23],
    
    // Euro Numbers (1-12)
    hotBonus: [3, 8, 5], 
    // 11 and 12 are statistically colder due to being added only in 2022
    
    pairs: [[34, 49], [7, 35]]
  };

  /**
   * EXPERT KNOWLEDGE BASE MULTI MULTI (3600+ draws)
   * Based on provided data.
   */
  private readonly EXPERT_DATA_MULTI = {
      // Top 20 most frequent (Pewniaki)
      hot: [53, 57, 62, 48, 29, 74, 39, 46, 15, 69, 37, 24, 11, 18, 71, 5, 32, 76, 50, 6],
      // Often drawn as LAST (Plus)
      plus: [53, 39, 11, 74, 29], 
      // Cold numbers
      cold: [79, 80, 1, 2, 14, 25, 41, 60],
      // Best Pairs
      pairs: [[53, 62], [57, 74], [29, 48], [15, 46]]
  };
  
  // MOCK DATA FOR "RECENT DRAWS" TAB
  // In a real app, this would come from an API.
  private readonly MOCK_PAST_DRAWS: Record<GameType, PastDraw[]> = {
      lotto: [
          { date: '2024-05-18', numbers: [2, 14, 22, 29, 35, 44], bonusNumbers: [] },
          { date: '2024-05-16', numbers: [4, 8, 15, 23, 30, 41], bonusNumbers: [] },
      ],
      mini: [
          { date: '2024-05-18', numbers: [6, 14, 21, 28, 36], bonusNumbers: [] },
          { date: '2024-05-17', numbers: [2, 9, 15, 30, 41], bonusNumbers: [] },
      ],
      euro: [
          { date: '2024-05-17', numbers: [3, 18, 22, 34, 49], bonusNumbers: [3, 5] },
          { date: '2024-05-14', numbers: [1, 7, 15, 35, 44], bonusNumbers: [8, 10] },
      ],
      multi: [
          { date: '2024-05-18 (14:00)', numbers: [3, 6, 11, 15, 24, 29, 32, 37, 39, 46, 50, 53, 55, 62, 69, 71, 74, 76, 78, 80], bonusNumbers: [] },
          { date: '2024-05-18 (21:40)', numbers: [5, 8, 12, 18, 20, 29, 30, 48, 51, 53, 57, 60, 61, 65, 70, 72, 74, 75, 76, 77], bonusNumbers: [] },
      ]
  };

  // State
  activeGameId = signal<GameType>('lotto');
  
  // DEFAULT IS NOW EXPERT TREND
  dataSource = signal<DataSource>('expert_trend');
  
  manualHotNumbers = signal<Set<number>>(new Set());
  
  // Custom Data State
  customDataCounts = signal<Record<number, number>>({});
  customDataPairs = signal<number[][]>([]); // NEW: Store correlations from import
  customDataTotalDraws = signal<number>(0);
  
  stats = signal<NumberStat[]>([]);
  
  savedCoupons = signal<Coupon[]>([]);
  
  // Holds the list of past draws (starts with mock, can be added to)
  pastDraws = signal<Record<GameType, PastDraw[]>>(this.MOCK_PAST_DRAWS);

  activeGameConfig = computed(() => 
    this.games.find(g => g.id === this.activeGameId())!
  );
  
  // Computed for correlation/pairs display
  topPairs = computed(() => {
    if (this.dataSource() === 'expert_trend') {
       if (this.activeGameId() === 'lotto') return this.EXPERT_DATA_LOTTO.pairs;
       if (this.activeGameId() === 'mini') return this.EXPERT_DATA_MINI.pairs;
       if (this.activeGameId() === 'euro') return this.EXPERT_DATA_EURO.pairs;
       if (this.activeGameId() === 'multi') return this.EXPERT_DATA_MULTI.pairs;
    }
    if (this.dataSource() === 'custom_import') {
        return this.customDataPairs();
    }
    return [];
  });
  
  currentPastDraws = computed(() => {
      return this.pastDraws()[this.activeGameId()];
  });

  constructor() {
    effect(() => {
        this.calculateStats();
    });
  }

  setGame(gameId: GameType) {
    this.activeGameId.set(gameId);
    this.manualHotNumbers.set(new Set()); 
  }

  setDataSource(source: DataSource) {
    this.dataSource.set(source);
  }
  
  addManualDraw(numbers: number[], bonusNumbers: number[]) {
      const today = new Date().toISOString().split('T')[0];
      const newDraw: PastDraw = {
          date: today,
          numbers: [...numbers].sort((a,b) => a-b),
          bonusNumbers: [...bonusNumbers].sort((a,b) => a-b)
      };
      
      this.pastDraws.update(current => {
          const gameId = this.activeGameId();
          return {
              ...current,
              [gameId]: [newDraw, ...current[gameId] || []]
          };
      });
      
      // Also trigger a stats update if in manual/import mode (simplified logic)
      if (this.dataSource() !== 'expert_trend') {
          // In a real app, this would recalculate complex stats
          this.calculateStats(); 
      }
  }

  toggleManualHotNumber(num: number) {
    const current = new Set(this.manualHotNumbers());
    if (current.has(num)) {
      current.delete(num);
    } else {
      current.add(num);
    }
    this.manualHotNumbers.set(current);
  }

  // PARSER for User Data
  processImportedData(text: string): boolean {
    const counts: Record<number, number> = {};
    const pairCounts: Record<string, number> = {};
    let validDraws = 0;
    const lines = text.split('\n');
    
    // Basic regex for sequences of numbers
    const regex = /(\d{1,2}[,.\s]\d{1,2}[,.\s]\d{1,2})/; 

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            const numbersPart = match[0];
            const nums = numbersPart.split(/[,.\s]+/).map(n => parseInt(n.trim()));
            const config = this.activeGameConfig();
            const validNums = nums.filter(n => !isNaN(n) && n >= 1 && n <= config.totalNumbers);
            const sortedNums = [...validNums].sort((a, b) => a - b);
            
            // For Multi Multi we allow longer lines, for others ~5-6
            const minRequired = config.id === 'multi' ? 10 : 5;

            if (validNums.length >= minRequired) { 
                validDraws++;
                // Count individual numbers
                validNums.forEach(n => {
                    counts[n] = (counts[n] || 0) + 1;
                });

                // Calculate Pairs (Correlations)
                for (let i = 0; i < sortedNums.length; i++) {
                    for (let j = i + 1; j < sortedNums.length; j++) {
                        const key = `${sortedNums[i]}-${sortedNums[j]}`;
                        pairCounts[key] = (pairCounts[key] || 0) + 1;
                    }
                }
            }
        }
    }

    if (validDraws > 0) {
        this.customDataCounts.set(counts);
        this.customDataTotalDraws.set(validDraws);
        
        // Process top pairs from import
        const sortedPairs = Object.entries(pairCounts)
            .sort(([, countA], [, countB]) => countB - countA)
            .slice(0, 4)
            .map(([key]) => key.split('-').map(Number));
            
        this.customDataPairs.set(sortedPairs);
        
        this.setDataSource('custom_import');
        return true;
    }
    return false;
  }

  private calculateStats() {
    switch (this.dataSource()) {
      case 'expert_trend':
        this.loadExpertTrendStats();
        break;
      case 'manual':
        this.applyManualStats();
        break;
      case 'custom_import':
        this.loadCustomImportStats();
        break;
      // Default fallback to expert if something goes wrong
      default:
        this.loadExpertTrendStats();
        break;
    }
  }

  private loadExpertTrendStats() {
    const config = this.activeGameConfig();
    const statsArray: NumberStat[] = [];
    
    const baseCount = 50;

    for (let i = 1; i <= config.totalNumbers; i++) {
        let count = baseCount;
        let status: 'hot' | 'neutral' | 'cold' = 'neutral';

        if (this.activeGameId() === 'lotto') {
            if (this.EXPERT_DATA_LOTTO.hot.includes(i)) { count = 100; status = 'hot'; }
            else if (this.EXPERT_DATA_LOTTO.cold.includes(i)) { count = 10; status = 'cold'; }
        } else if (this.activeGameId() === 'mini') {
            if (this.EXPERT_DATA_MINI.hot.includes(i)) { count = 100; status = 'hot'; }
            else if (this.EXPERT_DATA_MINI.cold.includes(i)) { count = 10; status = 'cold'; }
        } else if (this.activeGameId() === 'euro') {
             if (this.EXPERT_DATA_EURO.hotMain.includes(i)) { count = 100; status = 'hot'; }
             else if (this.EXPERT_DATA_EURO.coldMain.includes(i)) { count = 10; status = 'cold'; }
        } else if (this.activeGameId() === 'multi') {
             if (this.EXPERT_DATA_MULTI.hot.includes(i)) { 
                 // Give extra weight to top 5 hot numbers in Multi
                 const rank = this.EXPERT_DATA_MULTI.hot.indexOf(i);
                 count = rank < 5 ? 120 : 100; 
                 status = 'hot'; 
             }
             else if (this.EXPERT_DATA_MULTI.cold.includes(i)) { count = 5; status = 'cold'; }
        }

        // Add noise to make charts look alive but keeping the trend
        if (status === 'neutral') count += Math.floor(Math.random() * 20) - 10;

        statsArray.push({
            number: i,
            count: count,
            frequency: count / 100,
            status: status
        });
    }

    statsArray.sort((a, b) => b.count - a.count);
    this.stats.set(statsArray.sort((a, b) => a.number - b.number));
  }

  private loadCustomImportStats() {
    const config = this.activeGameConfig();
    const statsArray: NumberStat[] = [];
    const counts = this.customDataCounts();
    const total = this.customDataTotalDraws();

    for (let i = 1; i <= config.totalNumbers; i++) {
        const count = counts[i] || 0;
        statsArray.push({
            number: i,
            count: count,
            frequency: total > 0 ? count / total : 0,
            status: 'neutral'
        });
    }
    statsArray.sort((a, b) => b.count - a.count);
    this.assignHotColdStatus(statsArray, config.totalNumbers);
    this.stats.set(statsArray.sort((a, b) => a.number - b.number));
  }

  private applyManualStats() {
    const config = this.activeGameConfig();
    const statsArray: NumberStat[] = [];
    const manualHot = this.manualHotNumbers();

    for (let i = 1; i <= config.totalNumbers; i++) {
        statsArray.push({
            number: i,
            count: manualHot.has(i) ? 100 : Math.floor(Math.random() * 50),
            frequency: 0,
            status: manualHot.has(i) ? 'hot' : 'neutral'
        });
    }
    statsArray.sort((a, b) => b.count - a.count);
    this.assignHotColdStatus(statsArray, config.totalNumbers, manualHot);
    this.stats.set(statsArray.sort((a, b) => a.number - b.number));
  }

  private assignHotColdStatus(statsArray: NumberStat[], totalNumbers: number, manualHot?: Set<number>) {
    const hotThreshold = Math.floor(totalNumbers * 0.2);
    const coldThreshold = Math.floor(totalNumbers * 0.8);

    statsArray.forEach((stat, index) => {
      if (manualHot && manualHot.has(stat.number)) {
          stat.status = 'hot';
      } else {
        if (index < hotThreshold && (!manualHot || !manualHot.has(stat.number))) stat.status = 'hot';
        else if (index > coldThreshold) stat.status = 'cold';
        else stat.status = 'neutral';
      }
    });
  }

  generateSmartPrediction(requestedSize?: number): { numbers: number[], bonusNumbers: number[], logic: string[] } {
    const config = this.activeGameConfig();
    const allStats = [...this.stats()].sort((a, b) => b.count - a.count);
    
    // For Multi Multi, user chooses size (1-10). For others, it's fixed in config.
    const targetSize = requestedSize || config.drawSize;
    
    const selection = new Set<number>();
    const bonusSelection = new Set<number>();
    const logic: string[] = [];
    
    // 1. MAIN NUMBERS LOGIC
    const hotPool = allStats.filter(s => s.status === 'hot');
    const coldPool = allStats.filter(s => s.status === 'cold');
    const neutralPool = allStats.filter(s => s.status === 'neutral');

    // How many hot numbers to aim for? Usually 50-70% of the ticket
    let hotTarget = Math.ceil(targetSize * 0.6);

    // Logic is primarily EXPERT now
    if (this.dataSource() === 'expert_trend') {
        if (this.activeGameId() === 'lotto') {
            logic.push(`Lotto Expert: Analiza 2021-2025.`);
            this.tryAddPair(selection, this.EXPERT_DATA_LOTTO.pairs, logic);
        } else if (this.activeGameId() === 'mini') {
            logic.push(`Mini Expert: 5-letni trend.`);
            this.tryAddPair(selection, this.EXPERT_DATA_MINI.pairs, logic);
        } else if (this.activeGameId() === 'euro') {
            logic.push(`Eurojackpot Expert: Trend (34, 49, 20...).`);
            this.tryAddPair(selection, this.EXPERT_DATA_EURO.pairs, logic);
        } else if (this.activeGameId() === 'multi') {
            logic.push(`Multi Expert: Baza 3600 losowań.`);
            logic.push(`Pewniak Absolutny: 53.`);
            // Priority 1: Ensure "Plus" numbers are represented if possible
            const plusNums = this.EXPERT_DATA_MULTI.plus;
            if (Math.random() > 0.1) {
                // 90% chance to include a "Plus" favorite
                const plusPick = plusNums[Math.floor(Math.random() * plusNums.length)];
                selection.add(plusPick);
            }
            this.tryAddPair(selection, this.EXPERT_DATA_MULTI.pairs, logic);
        }
        hotTarget = Math.max(0, hotTarget - selection.size);
    } else {
         logic.push(`Strategia użytkownika (Import/Manual).`);
         // Use correlations from import if available
         if (this.dataSource() === 'custom_import' && this.customDataPairs().length > 0) {
            this.tryAddPair(selection, this.customDataPairs(), logic);
         }
    }

    // Fill Main
    this.fillFromPool(selection, hotPool, targetSize - 1); // Heavily favor hot
    // Only add cold numbers if we have room (e.g. bet size > 4)
    if (targetSize > 4) {
        this.fillFromPool(selection, coldPool, targetSize); 
    }
    this.fillFromPool(selection, neutralPool, targetSize); // Fill rest
    // Final check randoms if pools exhausted
    while (selection.size < targetSize) {
        const r = Math.floor(Math.random() * config.totalNumbers) + 1;
        selection.add(r);
    }

    // 2. BONUS NUMBERS LOGIC (Only for Euro)
    if (config.bonusTotalNumbers && config.bonusDrawSize) {
        if (this.dataSource() === 'expert_trend' && this.activeGameId() === 'euro') {
            logic.push(`Euro Bonus: Priorytet (3, 8, 5) - "Królowie Bonusów".`);
            
            // Try adding hot bonus numbers
            const hotBonus = this.EXPERT_DATA_EURO.hotBonus;
            // 70% chance to pick at least one hot bonus
            if (Math.random() < 0.7) {
                const pick = hotBonus[Math.floor(Math.random() * hotBonus.length)];
                bonusSelection.add(pick);
            }
        }
        
        // Fill rest of bonus
        let safeCounter = 0;
        while (bonusSelection.size < config.bonusDrawSize && safeCounter < 100) {
            safeCounter++;
            const r = Math.floor(Math.random() * config.bonusTotalNumbers) + 1;
            
            // EXPERT LOGIC:
            // Penalize 11 and 12 in Eurojackpot Expert Mode because they were added in 2022
            if (this.dataSource() === 'expert_trend' && this.activeGameId() === 'euro') {
                if ((r === 11 || r === 12) && Math.random() > 0.15) {
                    continue; 
                }
            }
            bonusSelection.add(r);
        }
    }

    return {
      numbers: Array.from(selection).sort((a, b) => a - b),
      bonusNumbers: Array.from(bonusSelection).sort((a, b) => a - b),
      logic
    };
  }

  private tryAddPair(selection: Set<number>, pairs: number[][], logic: string[]) {
      if (Math.random() > 0.3 && pairs.length > 0) {
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        // Only add if not already present
        if (!pair.some(p => selection.has(p))) {
            pair.forEach(n => selection.add(n));
            logic.push(`Wykryto silną parę: (${pair.join(' i ')}).`);
        }
      }
  }

  private fillFromPool(selection: Set<number>, pool: NumberStat[], targetSize: number) {
      if (selection.size >= targetSize) return;
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      
      for (const stat of shuffled) {
          if (selection.size >= targetSize) break;
          selection.add(stat.number);
      }
  }

  saveCoupon(numbers: number[], bonusNumbers: number[], type: 'ai' | 'manual') {
    const newCoupon: Coupon = {
      id: crypto.randomUUID(),
      type: type,
      date: new Date(),
      gameId: this.activeGameId(),
      gameName: this.activeGameConfig().name,
      numbers: [...numbers].sort((a, b) => a - b),
      bonusNumbers: [...bonusNumbers].sort((a, b) => a - b),
      drawResult: null,
      bonusDrawResult: null,
      matches: null,
      bonusMatches: null,
      isRealCheck: false
    };
    this.savedCoupons.update(prev => [newCoupon, ...prev]);
  }

  checkCouponResult(couponId: string) {
    const config = this.activeGameConfig();
    const draw = this.generateRandomDraw(config.totalNumbers, config.drawSize).sort((a, b) => a - b);
    let bonusDraw: number[] = [];
    if (config.bonusTotalNumbers && config.bonusDrawSize) {
        bonusDraw = this.generateRandomDraw(config.bonusTotalNumbers, config.bonusDrawSize).sort((a, b) => a - b);
    }
    
    this.savedCoupons.update(coupons => coupons.map(c => {
      if (c.id === couponId) {
        const matches = c.numbers.filter(n => draw.includes(n)).length;
        const bonusMatches = c.bonusNumbers.filter(n => bonusDraw.includes(n)).length;
        return { 
            ...c, 
            drawResult: draw, 
            bonusDrawResult: bonusDraw, 
            matches, 
            bonusMatches,
            isRealCheck: false 
        };
      }
      return c;
    }));
  }

  checkCouponsAgainstRealNumbers(winningNumbers: number[], bonusWinningNumbers: number[] = []) {
    const sortedWinning = [...winningNumbers].sort((a, b) => a - b);
    const sortedBonus = [...bonusWinningNumbers].sort((a, b) => a - b);
    const currentGameId = this.activeGameId();

    this.savedCoupons.update(coupons => coupons.map(c => {
      if (c.gameId === currentGameId) {
        // Multi Multi specific: Check how many of USER numbers are in the WINNING 20 set
        const matches = c.numbers.filter(n => sortedWinning.includes(n)).length;
        const bonusMatches = c.bonusNumbers.filter(n => sortedBonus.includes(n)).length;
        return { 
          ...c, 
          drawResult: sortedWinning, 
          bonusDrawResult: sortedBonus,
          matches,
          bonusMatches,
          isRealCheck: true 
        };
      }
      return c;
    }));
  }

  clearHistory() {
    this.savedCoupons.set([]);
  }

  private pickRandomFrom(pool: NumberStat[]): NumberStat {
    if (pool.length === 0) return this.stats()[Math.floor(Math.random() * this.stats().length)];
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }

  private generateRandomDraw(total: number, size: number): number[] {
    const numbers = new Set<number>();
    while (numbers.size < size) {
      numbers.add(Math.floor(Math.random() * total) + 1);
    }
    return Array.from(numbers);
  }
}
