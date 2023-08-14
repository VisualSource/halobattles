/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_USE_STORE_USER_ID: "fixed" | "random" | "default"
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module "@tweenjs/tween.js" {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type UnknownProps = Record<string, any>;
    declare const now: () => number;
    type InterpolationFunction = (v: number[], k: number) => number;
    type EasingFunction = (amount: number) => number;
    type EasingFunctionGroup = {
        In: EasingFunction;
        Out: EasingFunction;
        InOut: EasingFunction;
    };
    /**
     * The Ease class provides a collection of easing functions for use with tween.js.
     */
    export declare const Easing: Readonly<{
        Linear: Readonly<EasingFunctionGroup & {
            None: EasingFunction;
        }>;
        Quadratic: Readonly<EasingFunctionGroup>;
        Cubic: Readonly<EasingFunctionGroup>;
        Quartic: Readonly<EasingFunctionGroup>;
        Quintic: Readonly<EasingFunctionGroup>;
        Sinusoidal: Readonly<EasingFunctionGroup>;
        Exponential: Readonly<EasingFunctionGroup>;
        Circular: Readonly<EasingFunctionGroup>;
        Elastic: Readonly<EasingFunctionGroup>;
        Back: Readonly<EasingFunctionGroup>;
        Bounce: Readonly<EasingFunctionGroup>;
        generatePow(power?: number): EasingFunctionGroup;
    }>;
    export declare const Interpolation: {
        Linear: (v: number[], k: number) => number;
        Bezier: (v: number[], k: number) => number;
        CatmullRom: (v: number[], k: number) => number;
        Utils: {
            Linear: (p0: number, p1: number, t: number) => number;
            Bernstein: (n: number, i: number) => number;
            Factorial: (n: number) => number;
            CatmullRom: (p0: number, p1: number, p2: number, p3: number, t: number) => number;
        };
    };
    /**
     * Controlling groups of tweens
     *
     * Using the TWEEN singleton to manage your tweens can cause issues in large apps with many components.
     * In these cases, you may want to create your own smaller groups of tween
     */
    export declare class Group {
        private _tweens;
        private _tweensAddedDuringUpdate;
        getAll(): Array<Tween<UnknownProps>>;
        removeAll(): void;
        add(tween: Tween<UnknownProps>): void;
        remove(tween: Tween<UnknownProps>): void;
        update(time?: number, preserve?: boolean): boolean;
    }
    /**
     * Tween.js - Licensed under the MIT license
     * https://github.com/tweenjs/tween.js
     * ----------------------------------------------
     *
     * See https://github.com/tweenjs/tween.js/graphs/contributors for the full list of contributors.
     * Thank you all, you're awesome!
     */

    export declare class Tween<T extends UnknownProps> {
        private _object;
        private _group;
        private _isPaused;
        private _pauseStart;
        private _valuesStart;
        private _valuesEnd;
        private _valuesStartRepeat;
        private _duration;
        private _isDynamic;
        private _initialRepeat;
        private _repeat;
        private _repeatDelayTime?;
        private _yoyo;
        private _isPlaying;
        private _reversed;
        private _delayTime;
        private _startTime;
        private _easingFunction;
        private _interpolationFunction;
        private _chainedTweens;
        private _onStartCallback?;
        private _onStartCallbackFired;
        private _onEveryStartCallback?;
        private _onEveryStartCallbackFired;
        private _onUpdateCallback?;
        private _onRepeatCallback?;
        private _onCompleteCallback?;
        private _onStopCallback?;
        private _id;
        private _isChainStopped;
        private _propertiesAreSetUp;
        constructor(_object: T, _group?: Group | false);
        getId(): number;
        isPlaying(): boolean;
        isPaused(): boolean;
        to(target: UnknownProps, duration?: number): this;
        duration(duration?: number): this;
        dynamic(dynamic?: boolean): this;
        start(time?: number, overrideStartingValues?: boolean): this;
        startFromCurrentValues(time?: number): this;
        private _setupProperties;
        stop(): this;
        end(): this;
        pause(time?: number): this;
        resume(time?: number): this;
        stopChainedTweens(): this;
        group(group?: Group): this;
        delay(amount?: number): this;
        repeat(times?: number): this;
        repeatDelay(amount?: number): this;
        yoyo(yoyo?: boolean): this;
        easing(easingFunction?: EasingFunction): this;
        interpolation(interpolationFunction?: InterpolationFunction): this;
        chain(...tweens: Array<Tween<unknown>>): this;
        onStart(callback?: (object: T) => void): this;
        onEveryStart(callback?: (object: T) => void): this;
        onUpdate(callback?: (object: T, elapsed: number) => void): this;
        onRepeat(callback?: (object: T) => void): this;
        onComplete(callback?: (object: T) => void): this;
        onStop(callback?: (object: T) => void): this;
        private _goToEnd;
        /**
         * @returns true if the tween is still playing after the update, false
         * otherwise (calling update on a paused tween still returns true because
         * it is still playing, just paused).
         */
        update(time?: number, autoStart?: boolean): boolean;
        private _updateProperties;
        private _handleRelativeValue;
        private _swapEndStartRepeatValues;
    }

    /**
     * Utils
     */
    export declare class Sequence {
        private static _nextId;
        static nextId(): number;
    }

    export declare const VERSION = "21.0.0";

    export declare const nextId: typeof Sequence.nextId;
    export declare const getAll: () => Tween<UnknownProps>[];
    export declare const removeAll: () => void;
    export declare const add: (tween: Tween<UnknownProps>) => void;
    export declare const remove: (tween: Tween<UnknownProps>) => void;
    export declare const update: (time?: number, preserve?: boolean) => boolean;

}