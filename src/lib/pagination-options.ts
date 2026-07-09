/**
 * Liste partagée des tailles de page disponibles, dans un module SANS
 * 'use client' pour pouvoir être importée depuis un Server Component
 * (sinon Next.js marshalle l'array vers un proxy et `.includes(...)` casse).
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE = 10
