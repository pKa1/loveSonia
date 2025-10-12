import { Page, expect } from '@playwright/test';

export async function registerAndLogin(page: Page, name = 'Tester') {
  const email = `tester+${Math.random().toString(36).slice(2,8)}@test.local`;
  const password = 'test12345';
  await page.goto('/auth');
  // Форма с табами, переключаемся на «Регистрация»
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await page.getByPlaceholder('Имя').fill(name);
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Пароль').fill(password);
  await page.getByLabel('Повторите пароль').fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  return { email, password };
}

export async function ensurePair(page: Page) {
  await page.getByRole('link', { name: 'Пара' }).click();
  const btn = page.getByRole('button', { name: 'Создать/Открыть мою пару' });
  await btn.click();
  await expect(page.getByText('Код:')).toBeVisible();
}

export async function createCategory(page: Page, name = 'Офис', color = '#ff8f70') {
  await page.getByRole('heading', { name: 'Категории событий' }).scrollIntoViewIfNeeded();
  await page.getByPlaceholder('Название категории').fill(name);
  await page.getByRole('button', { name: 'Добавить' }).click();
}

export function weekdayRus(d: Date) {
  return ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][d.getDay()];
}


