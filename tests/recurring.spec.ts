import { test, expect } from '@playwright/test';
import { registerAndLogin, ensurePair, createCategory, weekdayRus } from './utils';

test.describe('Recurring slots UI', () => {
  test('create slot -> week shows virtual; change fields globally; no duplicates; month shows', async ({ page }) => {
    await registerAndLogin(page);
    await ensurePair(page);
    await createCategory(page, 'Офис');

    // Add recurring slot (Понедельник 09:00–10:00), pick category
    await page.getByRole('heading', { name: 'Регулярное расписание' }).scrollIntoViewIfNeeded();
    await page.getByLabel('Название').fill('Планёрка');
    const weekday = new Date().getDay();
    await page.getByLabel('День недели').selectOption(weekdayRus(new Date()));
    await page.getByLabel('С').fill('09:00');
    await page.getByLabel('До').fill('10:00');
    await page.getByLabel('Категория').selectOption({ label: 'Офис' });
    await page.getByRole('button', { name: 'Добавить слот' }).click();

    // Go to calendar week view
    await page.getByRole('link', { name: 'Календарь' }).click();
    await page.getByRole('button', { name: 'Неделя' }).click();

    // Expect 1 block titled Планёрка in the week grid
    await expect(page.getByText('Планёрка').first()).toBeVisible();

    // Open slot block -> click "Изменить слот"
    await page.getByText('Планёрка').first().click();
    await page.getByRole('link', { name: 'Изменить слот' }).click();

    // On Pair page, change assignee to "ты", category остаётся, и поменяем заголовок
    await page.getByRole('heading', { name: 'Регулярное расписание' }).scrollIntoViewIfNeeded();
    await page.locator('label:has-text("Назначение") + select').first().selectOption('PARTNER');
    const titleInput = page.locator('label:has-text("Название") input').first();
    await titleInput.fill('Планёрка команда');
    await titleInput.blur();

    // Back to calendar week, expect updated title and exactly one block (no duplicates)
    await page.getByRole('link', { name: 'Календарь' }).click();
    await page.getByRole('button', { name: 'Неделя' }).click();
    await expect(page.locator('text=Планёрка команда').first()).toBeVisible();
    await expect(page.locator('text=Планёрка команда')).toHaveCount(1);

    // Open virtual in calendar modal and ensure there is NO per-instance edit path
    await page.getByText('Планёрка команда').first().click();
    await expect(page.getByRole('link', { name: 'Изменить слот' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeHidden();

    // В «Месяц» элементы тоже видны
    await page.getByRole('button', { name: 'Месяц' }).click();
    await expect(page.locator('text=Планёрка команда').first()).toBeVisible();
  });
});


