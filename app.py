from flask import Flask, request, jsonify, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
import hashlib
import os
import secrets
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder='static', static_url_path='/static')

app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('COOKIE_SECURE', '0') == '1'

# Local = SQLite
# Online = PostgreSQL through DATABASE_URL
database_url = os.environ.get(
    'DATABASE_URL',
    f"sqlite:///{os.path.join(BASE, 'grades.db')}"
)

# Some PostgreSQL providers still return postgres://
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Student(db.Model):
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    code_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    code_display = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False)

    grades = db.relationship(
        'Grade',
        backref='student',
        cascade='all, delete-orphan'
    )

    notes = db.relationship(
        'Note',
        backref='student',
        cascade='all, delete-orphan'
    )


class Grade(db.Model):
    __tablename__ = 'grades'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(
        db.Integer,
        db.ForeignKey('students.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )

    subject = db.Column(db.String(120), nullable=False)
    grade = db.Column(db.Float, nullable=False)
    max_grade = db.Column(db.Float, nullable=False)
    percentage = db.Column(db.Float, nullable=False)
    recorded_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        index=True
    )


class Note(db.Model):
    __tablename__ = 'notes'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(
        db.Integer,
        db.ForeignKey('students.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )

    subject = db.Column(db.String(120))
    note = db.Column(db.Text, nullable=False)
    period = db.Column(db.String(120))
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        index=True
    )


def hash_code(code):
    return hashlib.sha256(
        code.strip().upper().encode()
    ).hexdigest()


def init_db():
    db.create_all()

    # Create demo account only when the database is completely empty
    if Student.query.first() is None:
        now = datetime.now(timezone.utc)

        student = Student(
            name='Demo Student',
            code_hash=hash_code('DEMO-2026'),
            code_display='DEMO-2026',
            created_at=now
        )

        db.session.add(student)
        db.session.flush()

        samples = [
            ('Math', 82, 100),
            ('Physics', 68, 100),
            ('Chemistry', 74, 100),
            ('English', 88, 100),
            ('Arabic', 91, 100)
        ]

        for subject, grade, maximum in samples:
            db.session.add(
                Grade(
                    student_id=student.id,
                    subject=subject,
                    grade=grade,
                    max_grade=maximum,
                    percentage=round((grade / maximum) * 100, 2),
                    recorded_at=now
                )
            )

        db.session.commit()


def get_student_by_session():
    sid = session.get('student_id')

    if not sid:
        return None

    return db.session.get(Student, sid)


def grade_payload(grade):
    return {
        'id': grade.id,
        'student_id': grade.student_id,
        'subject': grade.subject,
        'grade': grade.grade,
        'max_grade': grade.max_grade,
        'percentage': grade.percentage,
        'recorded_at': grade.recorded_at.isoformat()
    }


def note_payload(note):
    return {
        'id': note.id,
        'student_id': note.student_id,
        'subject': note.subject,
        'note': note.note,
        'period': note.period,
        'created_at': note.created_at.isoformat()
    }


def student_payload(student):

    grades = (
        Grade.query
        .filter_by(student_id=student.id)
        .order_by(Grade.recorded_at.asc(), Grade.id.asc())
        .all()
    )

    notes = (
        Note.query
        .filter_by(student_id=student.id)
        .order_by(Note.created_at.desc(), Note.id.desc())
        .all()
    )

    return {
        'id': student.id,
        'name': student.name,
        'code': student.code_display,
        'grades': [grade_payload(x) for x in grades],
        'notes': [note_payload(x) for x in notes]
    }


@app.get('/')
def index():
    return send_from_directory(BASE, 'index.html')


@app.get('/api/me')
def me():

    student = get_student_by_session()

    return jsonify({
        'authenticated': bool(student),
        'student': student_payload(student) if student else None
    })


@app.post('/api/auth')
def auth():

    data = request.get_json(force=True)

    code = (data.get('code') or '').strip()

    if not code:
        return jsonify({
            'error': 'Student code is required.'
        }), 400

    student = Student.query.filter_by(
        code_hash=hash_code(code)
    ).first()

    if not student:
        return jsonify({
            'error': 'Invalid student code.'
        }), 401

    session['student_id'] = student.id

    return jsonify(student_payload(student))


@app.post('/api/logout')
def logout():

    session.clear()

    return jsonify({
        'ok': True
    })


@app.post('/api/students')
def create_student():

    data = request.get_json(force=True)

    name = (data.get('name') or '').strip()
    code = (data.get('code') or '').strip()

    if len(name) < 2 or len(code) < 4:
        return jsonify({
            'error': 'Enter a student name and a code of at least 4 characters.'
        }), 400

    existing = Student.query.filter_by(
        code_hash=hash_code(code)
    ).first()

    if existing:
        return jsonify({
            'error': 'That student code is already in use.'
        }), 409

    student = Student(
        name=name,
        code_hash=hash_code(code),
        code_display=code.upper(),
        created_at=datetime.now(timezone.utc)
    )

    db.session.add(student)
    db.session.commit()

    session['student_id'] = student.id

    return jsonify(student_payload(student)), 201


@app.post('/api/grades')
def add_grade():

    student = get_student_by_session()

    if not student:
        return jsonify({
            'error': 'Authenticate first.'
        }), 401

    data = request.get_json(force=True)

    subject = (data.get('subject') or '').strip()

    try:
        grade = float(data.get('grade'))
        maximum = float(data.get('max_grade'))
    except (TypeError, ValueError):
        return jsonify({
            'error': 'Grade and maximum must be numbers.'
        }), 400

    if not subject or maximum <= 0 or grade < 0 or grade > maximum:
        return jsonify({
            'error': 'Check the subject and grade range.'
        }), 400

    percentage = round(
        (grade / maximum) * 100,
        2
    )

    new_grade = Grade(
        student_id=student.id,
        subject=subject,
        grade=grade,
        max_grade=maximum,
        percentage=percentage,
        recorded_at=datetime.now(timezone.utc)
    )

    db.session.add(new_grade)
    db.session.commit()

    return jsonify({
        'ok': True,
        'percentage': percentage
    })


@app.post('/api/notes')
def add_note():

    student = get_student_by_session()

    if not student:
        return jsonify({
            'error': 'Authenticate first.'
        }), 401

    data = request.get_json(force=True)

    note = (data.get('note') or '').strip()
    subject = (data.get('subject') or '').strip() or None
    period = (data.get('period') or '').strip() or None

    if not note:
        return jsonify({
            'error': 'Write a note first.'
        }), 400

    new_note = Note(
        student_id=student.id,
        subject=subject,
        note=note,
        period=period,
        created_at=datetime.now(timezone.utc)
    )

    db.session.add(new_note)
    db.session.commit()

    return jsonify({
        'ok': True
    })


@app.get('/api/data')
def data():

    student = get_student_by_session()

    if not student:
        return jsonify({
            'error': 'Authenticate first.'
        }), 401

    return jsonify(student_payload(student))


# Create database tables automatically
with app.app_context():
    init_db()


if __name__ == '__main__':
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True
    )
