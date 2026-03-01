
import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { NumberStat } from './lotto-stats.service';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] });
  }

  async explainPrediction(prediction: number[], stats: NumberStat[], gameName: string): Promise<string> {
    const model = this.ai.models;
    
    // Prepare concise context
    const predictionStats = prediction.map(num => {
      const s = stats.find(stat => stat.number === num);
      return `${num} (Status: ${s?.status}, Wystąpień: ${s?.count})`;
    }).join(', ');

    const prompt = `
      Jesteś ekspertem Data Science. 
      Analizujesz wyniki symulacji gry liczbowej: ${gameName}.
      
      Oto wytypowane liczby przez algorytm hybrydowy: [${predictionStats}].
      
      Zadanie:
      Wydaj krótki, profesjonalny komentarz (max 3 zdania) w języku polskim, dlaczego ten zestaw jest interesujący statystycznie (np. balans między liczbami częstymi a rzadkimi). 
    `;

    try {
      const result = await model.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return result.text;
    } catch (error) {
      console.error('Gemini error:', error);
      return 'Nie udało się wygenerować analizy AI.';
    }
  }
}
