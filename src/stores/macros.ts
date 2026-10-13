import {defineStore} from 'pinia'

export interface IMacroCategory {
  id: string
  name: string
}

export interface IMacro {
  id: string
  name: string
  message: string
  // Unset only in data from older versions; normalize() moves those macros to Default
  categoryId?: string
}

interface IMacrosState {
  macros: IMacro[]
  categories: IMacroCategory[]
}

// Shared limits for macro and category names (MacroDialog, category editor, import)
export const MACRO_NAME_MAX_LENGTH = 30
export const CATEGORY_NAME_MAX_LENGTH = 30

// Export file format; older exports are a bare array of macros
const EXPORT_FORMAT = 'kbkvm-macros'
const EXPORT_VERSION = 2

// Built-in category every macro falls back to (new macros, older exports, deleted categories).
// It always exists and can't be renamed or deleted.
export const DEFAULT_CATEGORY_ID = 'default'
export const DEFAULT_CATEGORY_NAME = 'Default'

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * Validate an exported macros file. Accepts the current {format, categories, macros} object and
 * the older bare array of macros. Invalid entries are skipped and duplicate ids regenerated.
 * Macros from older exports, without a category, or pointing at an unknown category go into
 * Default; an exported category named "Default" is merged into it.
 */
export const parseMacrosFile = (data: unknown) => {
  const rawMacros: unknown[] | null = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as any).macros)
      ? (data as any).macros
      : null
  if (!rawMacros) {
    throw new Error('Invalid file format: expected exported macros')
  }
  const rawCategories: unknown[] = Array.isArray((data as any)?.categories) ? (data as any).categories : []

  let skipped = 0
  const categories: IMacroCategory[] = []
  // File category id -> id used here
  const categoryIdMap = new Map<string, string>()
  const usedIds = new Set<string>([DEFAULT_CATEGORY_ID])
  const usedNames = new Set<string>([DEFAULT_CATEGORY_NAME.toLowerCase()])
  for (const item of rawCategories as any[]) {
    const name = isNonEmptyString(item?.name) ? item.name.trim() : ''
    if (!isNonEmptyString(item?.id) || !name || name.length > CATEGORY_NAME_MAX_LENGTH) {
      skipped++
      continue
    }
    if (item.id === DEFAULT_CATEGORY_ID || name.toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase()) {
      categoryIdMap.set(item.id, DEFAULT_CATEGORY_ID)
      continue
    }
    if (usedNames.has(name.toLowerCase())) {
      skipped++
      continue
    }
    const id = usedIds.has(item.id) ? newId() : item.id
    usedIds.add(id)
    usedNames.add(name.toLowerCase())
    categoryIdMap.set(item.id, id)
    categories.push({id, name})
  }

  const macros: IMacro[] = []
  const macroIds = new Set<string>()
  for (const item of rawMacros as any[]) {
    if (
      !item ||
      typeof item !== 'object' ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.name) ||
      !isNonEmptyString(item.message) ||
      item.name.trim().length > MACRO_NAME_MAX_LENGTH
    ) {
      skipped++
      continue
    }
    let id = item.id
    while (macroIds.has(id)) {
      id = newId()
    }
    macroIds.add(id)
    macros.push({
      id,
      name: item.name.trim(),
      message: item.message,
      categoryId: categoryIdMap.get(item.categoryId) ?? DEFAULT_CATEGORY_ID,
    })
  }

  return {macros, categories, skipped}
}

export const useMacrosStore = defineStore('macrosStore', {
  state: (): IMacrosState => {
    return {
      macros: [],
      categories: [{id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME}],
    }
  },
  getters: {
    categoryById: (state) => (id?: string) => state.categories.find((c) => c.id === id),
    countInCategory: (state) => (categoryId: string) =>
      state.macros.filter((m) => m.categoryId === categoryId).length,
  },
  actions: {
    /**
     * Make sure Default exists (first) and every macro is in an existing category. Run on startup,
     * so macros saved before categories existed, or left uncategorized, move into Default.
     */
    normalize() {
      // A user category named "Default" merges into the built-in one
      const isDefaultName = (c: IMacroCategory) => c.name.toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase()
      const others = this.categories.filter((c) => c.id !== DEFAULT_CATEGORY_ID && !isDefaultName(c))
      this.categories = [{id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME}, ...others]
      const known = new Set(this.categories.map((c) => c.id))
      this.macros = this.macros.map((m) =>
        m.categoryId && known.has(m.categoryId) ? m : {...m, categoryId: DEFAULT_CATEGORY_ID},
      )
    },
    addMacro(macro: IMacro) {
      this.macros.push({...macro, categoryId: macro.categoryId ?? DEFAULT_CATEGORY_ID})
    },
    updateMacro(id: string, updates: Partial<Omit<IMacro, 'id'>>) {
      const index = this.macros.findIndex((m) => m.id === id)
      if (index !== -1) {
        this.macros[index] = {...this.macros[index], ...updates}
      }
    },
    deleteMacro(id: string) {
      this.macros = this.macros.filter((m) => m.id !== id)
    },
    clearAllMacros() {
      this.macros = []
    },
    /** Returns an error message, or null on success */
    validateCategoryName(name: string, exceptId?: string): string | null {
      const trimmed = name.trim()
      if (!trimmed) return 'Category name is required'
      if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
        return `Category name must be ${CATEGORY_NAME_MAX_LENGTH} characters or less`
      }
      const lower = trimmed.toLowerCase()
      if (this.categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === lower)) {
        return 'A category with that name already exists'
      }
      return null
    },
    addCategory(name: string): IMacroCategory {
      const category = {id: newId(), name: name.trim()}
      this.categories.push(category)
      return category
    },
    renameCategory(id: string, name: string) {
      const category = this.categories.find((c) => c.id === id)
      if (category && id !== DEFAULT_CATEGORY_ID) {
        category.name = name.trim()
      }
    },
    /** Macros in the category move to Default; Default itself can't be deleted */
    deleteCategory(id: string) {
      if (id === DEFAULT_CATEGORY_ID) return
      this.categories = this.categories.filter((c) => c.id !== id)
      this.macros = this.macros.map((m) => (m.categoryId === id ? {...m, categoryId: DEFAULT_CATEGORY_ID} : m))
    },
    importMacros(data: {macros: IMacro[]; categories: IMacroCategory[]}) {
      this.categories = data.categories
      this.macros = data.macros
      this.normalize()
    },
    exportMacros() {
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        categories: this.categories,
        macros: this.macros,
      }
    },
  },
  persist: {
    key: 'ls_key_kbkvm_macros',
    paths: ['macros', 'categories'],
  },
})
