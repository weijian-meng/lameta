import Fuse from "fuse.js";
import { Folder } from "./Folder";
import { FolderGroup } from "./FolderGroup";
import * as Path from "path";
import { computed, IComputedValue } from "mobx";
import { PersonMetadataFile } from "../Project/Person/Person";
import { SessionMetadataFile } from "../Project/Session/Session";
import { staticLanguageFinder } from "../../languageFinder/LanguageFinder";
import { NotifyException } from "../../components/Notify";

interface IndexedFolder {
  folder: Folder;
  blob: string; // concatenation of all field texts, file names, and file metadata fields
}

// Each FolderGroup owns one FolderSearchTermsIndex
export class FolderSearchTermsIndex {
  private readonly index: IComputedValue<Fuse<IndexedFolder>>;

  constructor(
    private readonly group: FolderGroup,
    getPersonContributionTerms?: () => Map<string, string[]>
  ) {
    // Keep the last index for successive searches. Metadata changes invalidate
    // it, but MobX does not rebuild it until the next search reads it.
    this.index = computed(() => this.build(getPersonContributionTerms?.()), {
      keepAlive: true
    });
  }

  private build(personContributionTerms?: Map<string, string[]>) {
    const items: IndexedFolder[] = this.group.items.map((folder) => ({
      folder,
      blob: this.makeBlob(
        folder,
        folder.metadataFile instanceof PersonMetadataFile
          ? personContributionTerms?.get(folder.displayName.toLocaleLowerCase())
          : undefined
      )
    }));
    // This gives us exact matches only. "Fuzzy", while conceivably helpful,
    // is too confusing for a user that is trying to filter down to a set
    // of folders to work with.
    return new Fuse(items, {
      keys: ["blob"],
      includeScore: false,
      threshold: 0.0,
      ignoreLocation: true,
      minMatchCharLength: kMinimumSearchTermLength
    });
  }

  public search(query: string): Folder[] {
    const trimmed = query.trim();
    if (!trimmed) return this.group.items;
    return this.index
      .get()
      .search(trimmed)
      .map((result) => result.item.folder);
  }

  private makeBlob(f: Folder, personContributionBits: string[] = []): string {
    const fieldBits = f.properties
      .values()
      .map((field: any) =>
        field && typeof field.text === "string" ? field.text : ""
      );
    const fileBits: string[] = [];
    (f.files || []).forEach((file: any) => {
      try {
        if (file && file.pathInFolderToLinkFileOrLocalCopy) {
          fileBits.push(Path.basename(file.pathInFolderToLinkFileOrLocalCopy));
        }
        // include all metadata field texts
        if (file && file.properties && file.properties.values) {
          const props = file.properties.values();
          for (const p of props) {
            if (p && typeof p.text === "string") fileBits.push(p.text);
          }
        }
        // include contributions (personReference, role, comments)
        if (file && Array.isArray(file.contributions)) {
          for (const c of file.contributions) {
            if (c.personReference) fileBits.push(c.personReference);
            if (c.role) fileBits.push(c.role);
            if (c.comments) fileBits.push(c.comments);
          }
        }
      } catch (e: any) {
        NotifyException(e, "Indexing file metadata failed");
      }
    });

    // Include person languages in search if this folder has a PersonMetadataFile
    const languageBits: string[] = [];
    if (f.metadataFile instanceof PersonMetadataFile) {
      for (const language of f.metadataFile.languages) {
        if (language.code) {
          // Include both the language code and the language name in the search
          languageBits.push(language.code);
          let languageName = "";
          try {
            languageName =
              staticLanguageFinder.findOneLanguageNameFromCode_Or_ReturnCode(
                language.code
              );
          } catch (e: any) {
            NotifyException(e, "Language name lookup failed");
          }
          if (languageName && languageName !== language.code) {
            languageBits.push(languageName);
          }
        }
      }
    }

    // Include session languages (subject and working) if this folder has a SessionMetadataFile
    if (f.metadataFile instanceof SessionMetadataFile) {
      const addLangFromCodes = (codes: string) => {
        codes
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .forEach((code) => {
            languageBits.push(code);
            let name = "";
            try {
              name =
                staticLanguageFinder.findOneLanguageNameFromCode_Or_ReturnCode(
                  code
                );
            } catch (e: any) {
              NotifyException(e, "Language name lookup failed");
            }
            if (name && name !== code) {
              languageBits.push(name);
            }
          });
      };
      try {
        const subject = f.properties.getTextStringOrEmpty("languages");
        addLangFromCodes(subject);
      } catch (e: any) {
        NotifyException(e, "Reading subject languages failed");
      }
      try {
        const working = f.properties.getTextStringOrEmpty("workingLanguages");
        addLangFromCodes(working);
      } catch (e: any) {
        NotifyException(e, "Reading working languages failed");
      }
    }

    return [
      ...fieldBits,
      ...fileBits,
      ...languageBits,
      ...personContributionBits
    ].join(" | ");
  }
}

// Shared minimum search length for folder searches and highlights.
export const kMinimumSearchTermLength = 2;
