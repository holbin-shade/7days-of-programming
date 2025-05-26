const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { execSync } = require('child_process');
const fs = require('fs');
const tempFilePath = './temp.py';

const app = express();
const PORT = 3000;

// Настройка EJS и статики
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Подключение к БД
const db = new sqlite3.Database('./data/database.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err.message);
    return;
  }

  console.log('База данных подключена');

  // Сначала создаем таблицу и добавляем задание
  db.run(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sample_input TEXT,
      expected_output TEXT,
      completed INTEGER DEFAULT 0, -- 0 — не выполнено, 1 — выполнено
      user_name TEXT -- Для хранения имени пользователя, который решил задачу
    )
  `, (err) => {
    if (err) {
      console.error('Ошибка при создании таблицы:', err.message);
      return;
    }

    // Добавляем 7 задач
    const challenges = [
      { day: 1, title: 'Сумма двух чисел', description: 'Введите два числа и получите их сумму.', sample_input: '2 3', expected_output: '5' },
      { day: 2, title: 'Умножение чисел', description: 'Введите два числа и получите их произведение.', sample_input: '4 5', expected_output: '20' },
      { day: 3, title: 'Проверка четности', description: 'Проверьте, является ли число четным.', sample_input: '7', expected_output: 'false' },
      { day: 4, title: 'Факториал числа', description: 'Посчитайте факториал числа.', sample_input: '5', expected_output: '120' },
      { day: 5, title: 'Числа Фибоначчи', description: 'Найдите n-е число Фибоначчи.', sample_input: '6', expected_output: '8' },
      { day: 6, title: 'Реверс строки', description: 'Переверните строку.', sample_input: 'hello', expected_output: 'olleh' },
      { day: 7, title: 'Палиндром', description: 'Проверьте, является ли строка палиндромом.', sample_input: 'madam', expected_output: 'true' }
    ];

    challenges.forEach(challenge => {
      db.run(`
        INSERT OR IGNORE INTO challenges (day, title, description, sample_input, expected_output)
        VALUES (?, ?, ?, ?, ?)
      `, [challenge.day, challenge.title, challenge.description, challenge.sample_input, challenge.expected_output], (err) => {
        if (err) {
          console.error('Ошибка при добавлении задания:', err.message);
          return;
        }
      });
    });

    // После создания таблицы и добавления задач, запускаем сервер
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
    });
  });
});

// Главная страница
app.get('/', (req, res) => {
  // Получаем все задания из базы данных
  db.all('SELECT * FROM challenges', (err, challenges) => {
    if (err) {
      console.error('Ошибка при получении задач:', err.message);
      return res.status(500).send('Ошибка сервера');
    }

    // Сортируем задачи по возрастанию дня
    const sortedChallenges = challenges.sort((a, b) => a.day - b.day);

    // Передаем отсортированные данные в шаблон
    res.render('index', { challenges: sortedChallenges });
  });
});


// Страница задания
app.get('/challenge/:day', (req, res) => {
    const { day } = req.params;
  
    db.get('SELECT * FROM challenges WHERE day = ?', [day], (err, challenge) => {
      if (err) {
        console.error('Ошибка при получении задания:', err.message);
        return res.status(500).send('Ошибка сервера');
      }
  
      if (!challenge) {
        return res.status(404).send('Задание не найдено');
      }
  
      res.render('challenge', { challenge });
    });
  });
  
  // Для списка заданий
  app.get('/', (req, res) => {
    db.all('SELECT * FROM challenges ORDER BY day ASC', (err, challenges) => { // Добавлена сортировка по дням
      if (err) {
        console.error('Ошибка при получении данных:', err.message);
        return res.status(500).send('Ошибка сервера');
      }
  
      res.render('index', { challenges });
    });
  });

// Отправка задания
app.post('/challenge/:day/submit', (req, res) => {
    const { day } = req.params;
    const { name, code } = req.body;
  
    // Получаем задание из базы данных
    db.get('SELECT * FROM challenges WHERE day = ?', [day], (err, challenge) => {
      if (err) {
        console.error('Ошибка при получении задания:', err.message);
        return res.status(500).send('Ошибка сервера');
      }
  
      // Логика проверки кода
      const output = runCode(code, challenge.sample_input);  // Функция, которая запускает код и проверяет вывод
  
      if (output === challenge.expected_output) {
        // Если решение правильное, обновляем статус задачи в БД
        db.run('UPDATE challenges SET completed = 1, user_name = ? WHERE day = ?', [name, day], (err) => {
          if (err) {
            console.error('Ошибка при обновлении статуса задачи:', err.message);
            return res.status(500).send('Ошибка сервера');
          }
          res.render('submit_success', { challenge, name });
        });
      } else {
        // Если решение неправильное, отображаем страницу с ошибкой
        res.render('submit_error', { challenge, name, message: 'Неправильный результат. Попробуйте снова!', code });
      }
    });
  });
  

  function runCode(code, input) {
    // Очистка кода от лишних отступов слева
    const cleanedCode = code.replace(/^\s+/gm, '');
  
    fs.writeFileSync(tempFilePath, cleanedCode);
  
    try {
      const { execSync } = require('child_process');
      const result = execSync(`echo "${input}" | python3 ${tempFilePath}`, { timeout: 3000 });
      return result.toString().trim();
    } catch (err) {
      console.error('Ошибка при запуске кода:', err.message);
      return '__error__';
    }
  }
// Статистика
app.get('/stats', (req, res) => {
    // Получаем все задания из базы данных, сортируем по дню
    db.all('SELECT * FROM challenges ORDER BY day', (err, rows) => {
      if (err) {
        console.error('Ошибка при получении данных из базы:', err.message);
        return res.status(500).send('Ошибка сервера');
      }
  
      // Считаем количество выполненных задач
      const challenges = rows;
      const daysCompleted = challenges.filter(challenge => challenge.completed === 1).length;
  
      // Передаем данные в шаблон
      res.render('stats', { challenges, daysCompleted });
    });
  });
  
