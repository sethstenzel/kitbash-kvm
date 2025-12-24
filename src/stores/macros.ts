import {defineStore} from 'pinia'

export interface IMacro {
  id: string
  name: string
  message: string
}

interface IMacrosState {
  macros: IMacro[]
}

export const useMacrosStore = defineStore('macrosStore', {
  state: (): IMacrosState => {
    return {
      macros: [],
    }
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
    importMacros(macros: IMacro[]) {
      this.macros = macros
    },
    exportMacros(): IMacro[] {
      return this.macros
    },
  },
  persist: {
    key: 'ls_key_kbkvm_macros',
    paths: ['macros'],
  },
})
