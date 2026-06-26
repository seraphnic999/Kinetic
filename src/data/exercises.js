// Prepopulated body sections and exercises for Kinetic
// "Other" is always the last option in each list

export const BODY_SECTIONS = [
  'Chest',
  'Back',
  'Shoulders',
  'Front Arms',
  'Back Arms',
  'Legs',
  'Core',
  'Other',
];

export const EXERCISES_BY_SECTION = {
  Chest: [
    'Bench Press',
    'Incline Bench Press',
    'Decline Bench Press',
    'Dumbbell Fly',
    'Cable Fly',
    'Push-Ups',
    'Chest Dips',
    'Other',
  ],
  Back: [
    'Deadlift',
    'Pull-Ups',
    'Lat Pulldown',
    'Seated Cable Row',
    'Bent-Over Row',
    'T-Bar Row',
    'Single-Arm Dumbbell Row',
    'Face Pull',
    'Dumbbell Pullover',
    'Other',
  ],
  Shoulders: [
    'Overhead Press',
    'Dumbbell Shoulder Press',
    'Lateral Raise',
    'Front Raise',
    'Rear Delt Fly',
    'Arnold Press',
    'Shrugs',
    'Other',
  ],
  'Front Arms': [
    'Barbell Curl',
    'Dumbbell Curl',
    'Hammer Curl',
    'Concentration Curl',
    'Cable Curl',
    'Preacher Curl',
    'Other',
  ],
  'Back Arms': [
    'Tricep Pushdown',
    'Skull Crusher',
    'Overhead Tricep Extension',
    'Close-Grip Bench Press',
    'Tricep Dips',
    'Kickback',
    'Other',
  ],
  Legs: [
    'Squat',
    'Leg Press',
    'Romanian Deadlift',
    'Leg Curl',
    'Leg Extension',
    'Lunges',
    'Calf Raise',
    'Hack Squat',
    'Other',
  ],
  Core: [
    'Plank',
    'Crunches',
    'Hanging Leg Raise',
    'Cable Crunch',
    'Russian Twist',
    'Ab Wheel',
    'Sit-Ups',
    'Other',
  ],
  Other: ['Other'],
};

export const WARMUP_TYPES = ['Treadmill', 'Steps'];

// Exercise type constants
export const EXERCISE_TYPES = {
  REGULAR:   'regular',
  COMBO:     'combo',
  WARMUP:    'warmup',
  INTERVALS: 'intervals',
};
