import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleTimer } from "../useIdleTimer";

describe("useIdleTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const IDLE_MS = 60 * 60 * 1000;

  it("calls onExpired after the idle timeout", () => {
    const onExpired = vi.fn();
    renderHook(() => useIdleTimer(onExpired, true));

    act(() => { vi.advanceTimersByTime(IDLE_MS + 1); });

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("does not call onExpired before the timeout elapses", () => {
    const onExpired = vi.fn();
    renderHook(() => useIdleTimer(onExpired, true));

    act(() => { vi.advanceTimersByTime(IDLE_MS - 1000); });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("resets the timer on user activity events", () => {
    const onExpired = vi.fn();
    renderHook(() => useIdleTimer(onExpired, true));

    // Advance to just before timeout, then fire a mousemove.
    act(() => { vi.advanceTimersByTime(IDLE_MS - 1000); });
    act(() => { window.dispatchEvent(new Event("mousemove")); });

    // Advance past the original timeout deadline — timer should have reset.
    act(() => { vi.advanceTimersByTime(IDLE_MS - 1000); });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("calls onExpired after a full timeout following activity", () => {
    const onExpired = vi.fn();
    renderHook(() => useIdleTimer(onExpired, true));

    act(() => { vi.advanceTimersByTime(IDLE_MS - 1000); });
    act(() => { window.dispatchEvent(new Event("keydown")); });
    act(() => { vi.advanceTimersByTime(IDLE_MS + 1); });

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("does not start the timer when disabled", () => {
    const onExpired = vi.fn();
    renderHook(() => useIdleTimer(onExpired, false));

    act(() => { vi.advanceTimersByTime(IDLE_MS + 1); });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("clears the timer when enabled transitions to false", () => {
    const onExpired = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useIdleTimer(onExpired, enabled),
      { initialProps: { enabled: true } }
    );

    act(() => { vi.advanceTimersByTime(IDLE_MS - 1000); });
    rerender({ enabled: false });
    act(() => { vi.advanceTimersByTime(IDLE_MS + 1); });

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("cleans up event listeners and timer on unmount", () => {
    const onExpired = vi.fn();
    const { unmount } = renderHook(() => useIdleTimer(onExpired, true));

    unmount();
    act(() => { vi.advanceTimersByTime(IDLE_MS + 1); });

    expect(onExpired).not.toHaveBeenCalled();
  });
});