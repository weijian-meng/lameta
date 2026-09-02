import { test, expect as expect, Page } from "@playwright/test";
import { LametaE2ERunner } from "./lametaE2ERunner";
import { createNewProject, E2eProject } from "./various-e2e-helpers";
import { E2eFileList } from "./FileList-e2e-helpers";

let lameta: LametaE2ERunner;
let page: Page;
let project: E2eProject;
let fileList: E2eFileList;

const arrowDownKey =
  process.platform === "darwin" ? "Meta+ArrowDown" : "Control+ArrowDown";

test.describe("FileList", () => {
  test.beforeAll(async () => {
    lameta = new LametaE2ERunner();
    page = await lameta.launch();
    await lameta.cancelRegistration();
    project = await createNewProject(lameta, "Contributors");
    fileList = new E2eFileList(lameta, page, project.projectDirectory);
  });
  test.afterAll(async () => {
    await lameta.quit();
  });
  test("adding a new contributor with name only, then that contributor is available", async () => {
    await project.goToSessions();
    await project.addSession();
    await project.goToContributorsOfThisSession();
    await page.keyboard.press("Tab");
    await page.keyboard.type("foo");
    await page.keyboard.press("Enter");

    // regression test that there is not a second item named just "foo" instead of "foo ?"
    await page.locator(".PersonChooser").first().click();
    await page.keyboard.press(arrowDownKey);
    await expect(page.getByText("foo", { exact: true })).toHaveCount(0);

    await project.goToNotesOfThisSession();
    await project.goToContributorsOfThisSession();
    // open the dropdown
    const name = "foo ❓";
    await page.getByRole("gridcell", { name: name }).click();
    await page.getByRole("option", { name: name }).click();

    //    now try to use it in a new session
    await project.addSession();
    await project.goToContributorsOfThisSession();
    await page.keyboard.press("Tab");
    await page.keyboard.press(arrowDownKey);
    await page.getByRole("option", { name: name }).click();

    await lameta.softReload();

    await project.goToSessions();
    await project.addSession();
    await project.goToContributorsOfThisSession();
    // using the locator, find the first element with class "PersonChooser"
    await page.locator(".PersonChooser").click();
    await page.keyboard.press(arrowDownKey);
    await page.getByRole("option", { name: name }).click();
  });

  test("contributor comments keep focus while typing and persist on blur", async () => {
    await project.goToSessions();
    await project.addSession();
    await project.goToContributorsOfThisSession();

    // Comments are persisted only for actual contributors, not the intentionally
    // blank row at the bottom of the table.
    await page.keyboard.press("Tab");
    await page.keyboard.type("latency tester");
    await page.keyboard.press("Enter");

    const firstLine = "Comment 123/测试";
    const comment = `${firstLine}\nSecond line 🙂`;
    const textarea = page
      .getByTestId("contributor-comment-textarea")
      .first();

    await textarea.click();
    await textarea.pressSequentially(firstLine);
    await textarea.press("Enter");
    await textarea.pressSequentially("Second line 🙂");

    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveValue(comment);

    // Leaving the field commits the buffered edit to the observable model.
    await project.goToNotesOfThisSession();
    await project.goToContributorsOfThisSession();
    await expect(
      page.getByTestId("contributor-comment-textarea").first()
    ).toHaveValue(comment);

    // Leaving the top-level Sessions tab invokes the app's normal save path.
    // Verify the committed value also survives rebuilding the model from disk.
    await project.goToProject();
    await lameta.softReload();
    await project.goToSessions();
    const searchInput = page.getByTestId("folder-search-input");
    await searchInput.fill(firstLine);
    await searchInput.press("Enter");
    await project.goToContributorsOfThisSession();
    await expect(
      page.getByTestId("contributor-comment-textarea").first()
    ).toHaveValue(comment);
  });
});
