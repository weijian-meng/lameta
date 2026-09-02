import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentCell } from "./ContributorsTable";
import { SearchContext } from "../SearchContext";

describe("CommentCell", () => {
  let container: HTMLDivElement | undefined;
  let originalWindow: PropertyDescriptor;

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")!;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: document.defaultView
    });
  });

  afterEach(() => {
    if (container) {
      act(() => {
        ReactDOM.unmountComponentAtNode(container!);
      });
      container.remove();
      container = undefined;
    }
    Object.defineProperty(globalThis, "window", originalWindow);
  });

  it("keeps sequential Unicode and multiline keystrokes local until blur", () => {
    const onCommit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(
        React.createElement(
          SearchContext.Provider,
          { value: { rawSearchTerm: "测试", searchTerm: "测试" } },
          React.createElement(CommentCell, { value: "", onCommit })
        ),
        container
      );
    });

    const textarea = container.querySelector("textarea")!;
    for (const value of ["C", "Co", "Comment 测试", "Comment 测试\nline 2 🙂"]) {
      act(() => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        )!.set!;
        setValue.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    expect(textarea.value).toBe("Comment 测试\nline 2 🙂");
    expect(onCommit).not.toHaveBeenCalled();
    expect(
      container
        .querySelector('[data-testid="contributor-comment-cell"]')
        ?.getAttribute("data-has-highlight")
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="inline-highlight"]')?.textContent
    ).toBe("测试");

    act(() => {
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Comment 测试\nline 2 🙂");
  });

  it("flushes a pending edit before the app's unload save handler", () => {
    const onCommit = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(
        React.createElement(CommentCell, { value: "before", onCommit }),
        container
      );
    });

    const textarea = container.querySelector("textarea")!;
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!;
      setValue.call(textarea, "after");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("after");
  });
});
