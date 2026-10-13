import {defineStore} from 'pinia'

export interface IMacroCategory {
  id: string
  name: string
}

export interface IMacro {
  id: string
  name: string
  message: string
  // Unset = uncategorized
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
// Older exports have no categories; their macros are imported into this one
export const LEGACY_IMPORT_CATEGORY = 'Default'

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * Validate an exported macros file. Accepts the current {format, categories, macros} object and
 * the older bare array of macros (imported into a "Default" category). Invalid entries are
 * skipped, duplicate ids regenerated, and macros pointing at unknown categories become uncategorized.
 */
export const parseMacrosFile = (data: unknown) => {
  const isLegacy = Array.isArray(data)
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
  const categoryIds = new Set<string>()
  const categoryNames = new Set<string>()
  for (const item of rawCategories as any[]) {
    const name = isNonEmptyString(item?.name) ? item.name.trim() : ''
    if (!isNonEmptyString(item?.id) || !name || name.length > CATEGORY_NAME_MAX_LENGTH || categoryNames.has(name.toLowerCase())) {
      skipped++
      continue
    }
    const id = categoryIds.has(item.id) ? newId() : item.id
    categoryIds.add(id)
    categoryNames.add(name.toLowerCase())
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
    const macro: IMacro = {id, name: item.name.trim(), message: item.message}
    if (isNonEmptyString(item.categoryId) && categoryIds.has(item.categoryId)) {
      macro.categoryId = item.categoryId
    }
    macros.push(macro)
  }

  if (isLegacy && macros.length) {
    const category = {id: newId(), name: LEGACY_IMPORT_CATEGORY}
    categories.push(category)
    macros.forEach((m) => (m.categoryId = category.id))
  }

  return {macros, categories, skipped}
}

export const useMacrosStore = defineStore('macrosStore', {
  state: (): IMacrosState => {
    return {
      macros: [],
      categories: [],
    }
  },
  getters: {
    categoryById: (state) => (id?: string) => state.categories.find((c) => c.id === id),
    countInCategory: (state) => (categoryId: string | null) =>
      state.macros.filter((m) => (m.categoryId ?? null) === categoryId).length,
  },
  actions: {
    addMacro(macro: IMacro) {
      this.macros.push(macro)
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
      if (category) {
        category.name = name.trim()
      }
    },
    /** Macros in the category become uncategorized */
    deleteCategory(id: string) {
      this.categories = this.categories.filter((c) => c.id !== id)
      this.macros = this.macros.map((m) => (m.categoryId === id ? {...m, categoryId: undefined} : m))
    },
    importMacros(data: {macros: IMacro[]; categories: IMacroCategory[]}) {
      this.categories = data.categories
      this.macros = data.macros
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
