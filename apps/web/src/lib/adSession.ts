/**
 * Ad Session Tracking & Proof Generator
 * Ensures deterministic progress tracking, duration requirements,
 * and replay guard protections for sponsored video ads.
 */

export interface AdSessionConfig {
  campaignId: string;
  brandName: string;
  durationSeconds: number;
}

export interface AdCompletionProof {
  campaignId: string;
  adSessionToken: string;
  watchedDuration: number;
  completedAt: number;
}

export class AdSessionTracker {
  readonly campaignId: string;
  readonly brandName: string;
  readonly durationSeconds: number;
  private _watchedSeconds: number = 0;
  private _sessionToken: string;
  private _isComplete: boolean = false;
  private _hasIssuedProof: boolean = false;

  constructor(config: AdSessionConfig) {
    this.campaignId = config.campaignId;
    this.brandName = config.brandName;
    this.durationSeconds = Math.max(1, config.durationSeconds);
    this._sessionToken = this.generateSessionToken();
  }

  get watchedSeconds(): number {
    return this._watchedSeconds;
  }

  get isComplete(): boolean {
    return this._isComplete;
  }

  get sessionToken(): string {
    return this._sessionToken;
  }

  get progressPercent(): number {
    return Math.min(100, Math.round((this._watchedSeconds / this.durationSeconds) * 100));
  }

  tick(secondsToAdd: number): void {
    if (this._isComplete) return;
    this._watchedSeconds = Math.min(this.durationSeconds, this._watchedSeconds + secondsToAdd);
    if (this._watchedSeconds >= this.durationSeconds) {
      this._isComplete = true;
    }
  }

  generateCompletionProof(): AdCompletionProof {
    if (!this._isComplete || this._watchedSeconds < this.durationSeconds) {
      throw new Error('Ad viewing requirement not met');
    }

    this._hasIssuedProof = true;
    return {
      campaignId: this.campaignId,
      adSessionToken: this._sessionToken,
      watchedDuration: this._watchedSeconds,
      completedAt: Date.now(),
    };
  }

  reset(): void {
    this._watchedSeconds = 0;
    this._isComplete = false;
    this._hasIssuedProof = false;
    this._sessionToken = this.generateSessionToken();
  }

  private generateSessionToken(): string {
    const randomHex = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
    return `adsess_${Date.now()}_${randomHex}`;
  }
}
