const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const flash = require('connect-flash');
const fs = require('fs');
const tempFilePath = './temp.py';

const app = express();
const PORT = 3006;

// Настройка EJS и статики
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Настройка сессий и flash сообщений
app.use(session({
  secret: 'your_secret_key',  // Лучше взять из env переменных
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 день
}));
app.use(flash());

// Middleware для передачи сообщений и user в шаблоны
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Подключение к БД
const db = new sqlite3.Database('./data/database.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err.message);
    return;
  }

  console.log('База данных подключена');

  // Создаем таблицы: users и challenges
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day INTEGER UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        sample_input TEXT,
        expected_output TEXT,
        completed INTEGER DEFAULT 0,
        user_name TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Ошибка при создании таблицы challenges:', err.message);
        return;
      }

      // Добавляем задачи, если их еще нет
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
          }
        });
      });
    });

    // Запускаем сервер после инициализации
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
    });
  });
});

// Middleware для проверки авторизации
function checkAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error_msg', 'Пожалуйста, войдите в систему');
    return res.redirect('/login');
  }
  next();
}

// Главная страница
app.get('/', (req, res) => {
  db.all('SELECT * FROM challenges', (err, challenges) => {
    if (err) {
      console.error('Ошибка при получении задач:', err.message);
      return res.status(500).send('Ошибка сервера');
    }

    const sortedChallenges = challenges.sort((a, b) => a.day - b.day);

    res.render('index', {
      challenges: sortedChallenges,
      user: req.session.user
    });
  });
});



// регистрация

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).send('Ошибка сервера');
    if (user) {
      return res.render('register', { error: 'Пользователь уже существует' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
        if (err) return res.status(500).send('Ошибка сервера');
        res.redirect('/login');
      });
    } catch (e) {
      return res.status(500).send('Ошибка сервера');
    }
  });
});


// авторизация

app.get('/login', (req, res) => {
  res.render('login');
});

// В POST /login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).send('Ошибка сервера');
    if (!user) return res.render('login', { error: 'Неверный логин или пароль' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Неверный логин или пароль' });
    }

    // Правильно сохраняем user в сессии
    req.session.user = {
      id: user.id,
      username: user.username
    };
    res.redirect('/');
  });
});
// выход
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
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
  
