"use client";

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-2xl font-semibold">Инструкция</div>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">О приложении</h2>
        <p className="text-sm text-muted-foreground">
          ЛюблюСоню — Совместный календарь для двоих: вы и партнёр видите общий календарь и задачи, но
          каждое событие/задача помечается назначением: <b>я</b>, <b>ты</b> или <b>мы</b>.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Что такое «Пара» и как начать</h2>
        <p className="text-sm text-muted-foreground">
          «Пара» — это общий рабочий контур для двух аккаунтов. Все задачи и события внутри пары общие, но у каждого
          элемента есть назначение («я/ты/мы»), чтобы сразу понимать, кому он относится.
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
          <div className="font-medium text-foreground">Создать пару</div>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Откройте вкладку «Пара».</li>
            <li>Нажмите «Создать/Открыть мою пару» — система сгенерирует код пары.</li>
            <li>Поделитесь кодом или QR со второй половинкой (кнопки «Скопировать код/ссылку», «Показать QR»).</li>
          </ol>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
          <div className="font-medium text-foreground">Присоединиться к паре</div>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Откройте вкладку «Пара» на своём аккаунте.</li>
            <li>В поле «Присоединиться по коду» введите 6‑значный код, полученный от партнёра, и нажмите «Присоединиться».</li>
            <li>Либо перейдите по общей ссылке из окна QR/«Скопировать ссылку».</li>
          </ol>
        </div>
        <p className="text-sm text-muted-foreground">
          После соединения у вас появятся персональные цвета, общий цвет «мы» и тихие часы — их можно настроить во вкладке «Пара».
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Назначение: я / ты / мы</h2>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li><b>я</b>: задача/событие относится к текущему аккаунту.</li>
          <li><b>ты</b>: относится к партнёру.</li>
          <li><b>мы</b>: общее для двоих, отображается у обоих.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Подписи «я/ты» всегда относительные: у каждого в интерфейсе «я» — это он/она, «ты» — второй участник пары.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Календарь</h2>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>Режимы: Сегодня / Неделя / Месяц. В «Сегодня» и «Неделе» события выравниваются по времени 07:00–23:00.</li>
          <li>Два лейна: слева «я», справа «ты». «мы» растягивается на обе колонки.</li>
          <li>Клик по событию открывает окно с подробностями. Кнопка «Редактировать» — для изменения; «Удалить» — удаляет.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Задачи</h2>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>Фильтр по назначению: все / я / ты / мы.</li>
          <li>Один клик по задаче — развернуть и показать текст полностью.</li>
          <li>Двойной клик по задаче — открыть окно редактирования по центру.</li>
          <li>Можно задать срок (due), напоминание и отметить выполненной.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Тихие часы и цвета</h2>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>Во вкладке «Пара» настраиваются тихие часы и цвета участников/общий цвет «мы».</li>
          <li>Изменения цветов обновляются в интерфейсе сразу.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Сегодня</h2>
        <p className="text-sm text-muted-foreground">
          Раздел показывает только сегодняшние элементы для вашего аккаунта (ваши и «мы»). По клику — быстрый просмотр.
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          Метка «Возможен конфликт» появляется, если:
          <ul className="mt-2 list-disc pl-6 space-y-1">
            <li>два элемента идут слишком близко по времени (менее 60 минут между соседними пунктами), или</li>
            <li>какой‑то элемент попадает внутрь «тихих часов» пары.</li>
          </ul>
          Это мягкое предупреждение — вы можете открыть элементы и при необходимости сдвинуть время.
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Голосовой ввод</h2>
        <p className="text-sm text-muted-foreground">
          Быстро добавляйте задачи и события голосом: система распознаёт речь, определяет тип (событие/задача),
          дату и время в вашей тайм‑зоне. Перед сохранением вы увидите предпросмотр и сможете отредактировать.
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-2">
          <div className="font-medium text-foreground">Как воспользоваться</div>
          <ol className="list-decimal pl-6 space-y-1">
            <li>На главной нажмите кнопку «🎤 Голосом» и разрешите доступ к микрофону.</li>
            <li>Произнесите команду: «встреча завтра в 10», «звонок с 14 до 15:30», «задача купить торт в 19».</li>
            <li>Проверьте распознанный текст, при необходимости поправьте заголовок, время и назначение «я/ты/мы».</li>
            <li>Нажмите «Сохранить».</li>
          </ol>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
          <div className="font-medium text-foreground">Подсказки</div>
          <ul className="list-disc pl-6 space-y-1">
            <li>Можно говорить дни недели: «планёрка в понедельник с 9 до 10».</li>
            <li>Слова «утра/дня/вечера/ночи» понимаются: «в 3 дня» → 15:00.</li>
            <li>Дата без времени сохранится как дата события (время можно указать позже).</li>
          </ul>
        </div>
      </section>
    </div>
  );
}


