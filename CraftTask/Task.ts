export interface Task<T> {
    tick: () => void;
    isComplete: () => boolean;
    result: () => null | T;
}