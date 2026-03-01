
import { Component, input, computed } from '@angular/core';
import { NumberStat } from '../services/lotto-stats.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-histogram',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full">
      @if (mode() === 'bars') {
        <div class="overflow-x-auto pb-2">
          <div class="h-40 min-w-[300px] flex items-end justify-between gap-[1px] bg-slate-800/50 p-2 rounded-lg border border-slate-700">
            @for (stat of sortedStats(); track stat.number) {
              <div 
                class="relative flex-1 rounded-t-sm transition-all duration-500 hover:bg-white group"
                [style.height.%]="(stat.count / maxCount()) * 100"
                [class.bg-red-500]="stat.status === 'hot'"
                [class.bg-blue-500]="stat.status === 'cold'"
                [class.bg-slate-400]="stat.status === 'neutral'"
                [class.opacity-100]="isHighlighted(stat.number)"
                [class.opacity-30]="highlightNumbers().length > 0 && !isHighlighted(stat.number)"
              >
                <!-- Tooltip -->
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-max pointer-events-none">
                  <div class="bg-black text-[10px] text-white px-2 py-1 rounded border border-slate-600 shadow-xl">
                    #{{ stat.number }} ({{ stat.count }})
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      } @else {
        <!-- HEATMAP MODE -->
        <div class="grid grid-cols-7 gap-1.5 animate-[fadeIn_0.3s]">
          @for (stat of sortedStats(); track stat.number) {
             <div 
                class="aspect-square flex flex-col items-center justify-center rounded text-xs font-bold border transition-all duration-300 relative overflow-hidden"
                [style.background-color]="getHeatmapColor(stat.count)"
                [class.border-transparent]="!isHighlighted(stat.number)"
                [class.border-white]="isHighlighted(stat.number)"
                [class.scale-110]="isHighlighted(stat.number)"
                [class.z-10]="isHighlighted(stat.number)"
                [class.shadow-lg]="isHighlighted(stat.number)"
             >
                <span class="text-white/90 drop-shadow-md z-10">{{ stat.number }}</span>
                @if(stat.status === 'hot') { <div class="absolute top-0 right-0 w-1.5 h-1.5 bg-white rounded-full m-0.5"></div> }
             </div>
          }
        </div>
      }

      <div class="flex flex-wrap gap-4 justify-center mt-3 text-[10px] text-slate-400">
        <div class="flex items-center gap-1"><span class="w-2 h-2 bg-red-500 rounded-sm"></span> Hot</div>
        <div class="flex items-center gap-1"><span class="w-2 h-2 bg-slate-400 rounded-sm"></span> Neutral</div>
        <div class="flex items-center gap-1"><span class="w-2 h-2 bg-blue-500 rounded-sm"></span> Cold</div>
      </div>
    </div>
  `
})
export class HistogramComponent {
  data = input.required<NumberStat[]>();
  highlightNumbers = input<number[]>([]);
  mode = input<'bars' | 'heatmap'>('bars');

  sortedStats = computed(() => {
    return [...this.data()].sort((a, b) => a.number - b.number);
  });

  maxCount = computed(() => {
    return Math.max(...this.data().map(s => s.count), 1);
  });

  isHighlighted(num: number): boolean {
    return this.highlightNumbers().includes(num);
  }

  getHeatmapColor(count: number): string {
      const max = this.maxCount();
      const intensity = count / max;
      
      // Interpolate between Blue (Cold) -> Slate (Neutral) -> Red (Hot)
      // Simplified approach using tailwind-like logic via inline styles or just hardcoded HSL
      if (intensity > 0.7) {
          // Hotter (Red)
          const alpha = 0.5 + (intensity - 0.7) * 1.6; // 0.5 to 1.0
          return `rgba(239, 68, 68, ${Math.min(alpha, 1)})`; // red-500
      } else if (intensity < 0.3) {
           // Colder (Blue)
           const alpha = 0.5 + (0.3 - intensity) * 1.6;
           return `rgba(59, 130, 246, ${Math.min(alpha, 1)})`; // blue-500
      } else {
           // Neutral (Slate)
           return `rgba(100, 116, 139, 0.5)`; // slate-500 with opacity
      }
  }
}
