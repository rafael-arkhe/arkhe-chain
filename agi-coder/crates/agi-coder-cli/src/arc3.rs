//! A local turn-based frame with three levels.
//!
//! The action names follow the public ARC-AGI-3 shape: five keys, undo, and a cell click.
//! This environment is not an ARC-AGI-3 game and it does not compute an RHAE score.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const LEVELS: u8 = 3;

#[derive(Clone, Serialize, Deserialize)]
struct Snap {
    agent: (u8, u8),
    marks: Vec<(u8, u8)>,
}

#[derive(Serialize, Deserialize)]
struct Saved {
    level: u8,
    size: u8,
    goal: (u8, u8),
    snap: Snap,
    past: Vec<Snap>,
    actions: u32,
    #[serde(default)]
    started_at: u32,
    won: bool,
}

pub struct Seek {
    level: u8,
    size: u8,
    goal: (u8, u8),
    walls: Vec<(u8, u8)>,
    snap: Snap,
    past: Vec<Snap>,
    actions: u32,
    started_at: u32,
    won: bool,
}

impl Seek {
    pub fn new() -> Self {
        Self::begin(1, 0)
    }

    pub fn won(&self) -> bool {
        self.won
    }

    pub fn act(&mut self, action: &str, x: Option<u8>, y: Option<u8>) -> Result<(), String> {
        if self.actions >= 256 {
            return Err("the local action budget is 256".into());
        }
        if self.won && action != "undo" {
            if !matches!(action, "1" | "2" | "3" | "4" | "5" | "click") {
                return Err("action must be 1, 2, 3, 4, 5, undo, or click".into());
            }
            if self.level >= LEVELS {
                return Err("the local environment already ended; undo or reset".into());
            }
            let actions = self.actions;
            *self = Self::begin(self.level + 1, actions);
        }
        if action == "undo" {
            let Some(prev) = self.past.pop() else {
                return Err("nothing to undo".into());
            };
            self.snap = prev;
            self.actions += 1;
            self.won = self.snap.agent == self.goal;
            return Ok(());
        }
        self.past.push(self.snap.clone());
        match action {
            "1" => self.try_move(1, 0),
            "2" => self.try_move(-1, 0),
            "3" => self.try_move(0, 1),
            "4" => self.try_move(0, -1),
            "5" => {}
            "click" => {
                let x = x.ok_or("click needs x")?;
                let y = y.ok_or("click needs y")?;
                if x >= self.size || y >= self.size {
                    self.past.pop();
                    return Err("click is outside the frame".into());
                }
                let occupied = (x, y) == self.snap.agent
                    || (x, y) == self.goal
                    || self.walls.contains(&(x, y));
                if !occupied && !self.snap.marks.contains(&(x, y)) {
                    self.snap.marks.push((x, y));
                }
            }
            _ => {
                self.past.pop();
                return Err("action must be 1, 2, 3, 4, 5, undo, or click".into());
            }
        }
        self.actions += 1;
        self.won = self.snap.agent == self.goal;
        Ok(())
    }

    pub fn view(&self) -> Value {
        json!({
            "environment": "local-seek",
            "official": false,
            "score": null,
            "level": self.level,
            "levels": LEVELS,
            "walls": self.walls.len(),
            "actions": self.actions,
            "won": self.won,
            "ratio": self.ratio(),
            "frame": self.frame(),
            "reason": "local-seek has three levels. Level 3 has walls. A finished level reports steps over the known shortest path in this frame. It is not an ARC-AGI-3 environment and has no RHAE score.",
            "declares_agi": false
        })
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let saved = Saved {
            level: self.level,
            size: self.size,
            goal: self.goal,
            snap: self.snap.clone(),
            past: self.past.clone(),
            actions: self.actions,
            started_at: self.started_at,
            won: self.won,
        };
        let bytes = serde_json::to_vec_pretty(&saved).map_err(|error| error.to_string())?;
        std::fs::write(path, bytes).map_err(|error| error.to_string())
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        let saved: Saved = serde_json::from_slice(&bytes).map_err(|_| "local-seek file is not valid".to_string())?;
        if saved.level == 0 || saved.level > LEVELS || saved.size != 8 {
            return Err("local-seek file is out of range".into());
        }
        let walls = walls_for(saved.level);
        if saved.started_at > saved.actions
            || saved.goal.0 >= saved.size
            || saved.goal.1 >= saved.size
            || saved.snap.agent.0 >= saved.size
            || saved.snap.agent.1 >= saved.size
            || walls.contains(&saved.snap.agent)
            || walls.contains(&saved.goal)
        {
            return Err("local-seek file is out of range".into());
        }
        Ok(Self {
            level: saved.level,
            size: saved.size,
            goal: saved.goal,
            walls,
            snap: saved.snap,
            past: saved.past,
            actions: saved.actions,
            started_at: saved.started_at,
            won: saved.won,
        })
    }

    fn begin(level: u8, actions: u32) -> Self {
        let (size, agent, goal) = match level {
            1 => (8, (0, 0), (2, 0)),
            2 => (8, (0, 0), (0, 2)),
            _ => (8, (0, 0), (3, 2)),
        };
        Self {
            level,
            size,
            goal,
            walls: walls_for(level),
            snap: Snap {
                agent,
                marks: Vec::new(),
            },
            past: Vec::new(),
            actions,
            started_at: actions,
            won: false,
        }
    }

    fn try_move(&mut self, dx: i8, dy: i8) {
        let x = self.snap.agent.0 as i16 + i16::from(dx);
        let y = self.snap.agent.1 as i16 + i16::from(dy);
        let limit = i16::from(self.size);
        if (0..limit).contains(&x) && (0..limit).contains(&y) {
            let next = (x as u8, y as u8);
            if !self.walls.contains(&next) {
                self.snap.agent = next;
            }
        }
    }

    fn frame(&self) -> Vec<Vec<u8>> {
        let n = self.size as usize;
        let mut frame = vec![vec![0u8; n]; n];
        for (x, y) in &self.walls {
            frame[*y as usize][*x as usize] = 4;
        }
        for (x, y) in &self.snap.marks {
            frame[*y as usize][*x as usize] = 3;
        }
        frame[self.goal.1 as usize][self.goal.0 as usize] = 2;
        frame[self.snap.agent.1 as usize][self.snap.agent.0 as usize] = 1;
        frame
    }

    fn ratio(&self) -> Option<String> {
        if !self.won {
            return None;
        }
        let steps = self.actions.saturating_sub(self.started_at);
        Some(format!("{steps}/{}", shortest(self.level)))
    }
}

fn shortest(level: u8) -> u32 {
    match level {
        1 | 2 => 2,
        _ => 5,
    }
}

fn walls_for(level: u8) -> Vec<(u8, u8)> {
    if level == 3 {
        vec![(1, 0), (2, 0), (3, 1)]
    } else {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_rights_finish_level_one_and_the_next_action_opens_level_two() {
        let mut seek = Seek::new();
        seek.act("1", None, None).unwrap();
        seek.act("1", None, None).unwrap();
        let view = seek.view();
        assert_eq!(view["won"], true);
        assert_eq!(view["level"], 1);
        assert_eq!(view["levels"], 3);
        assert!(view["score"].is_null());
        assert_eq!(view["ratio"], "2/2");
        assert_eq!(view["declares_agi"], false);
        seek.act("3", None, None).unwrap();
        let view = seek.view();
        assert_eq!(view["level"], 2);
        assert_eq!(view["won"], false);
        assert_eq!(view["actions"], 3);
        assert_eq!(view["frame"][1][0], 1);
    }

    #[test]
    fn undo_click_and_a_wall_stay_inside_the_frame() {
        let mut seek = Seek::new();
        seek.act("2", None, None).unwrap();
        assert_eq!(seek.view()["frame"][0][0], 1);
        seek.act("click", Some(3), Some(1)).unwrap();
        assert_eq!(seek.view()["frame"][1][3], 3);
        seek.act("undo", None, None).unwrap();
        assert_eq!(seek.view()["frame"][1][3], 0);
        assert!(seek.act("click", Some(8), Some(0)).is_err());
        assert!(seek.act("9", None, None).is_err());
    }

    #[test]
    fn a_saved_frame_reloads_on_the_same_level() {
        let root = std::env::temp_dir().join(format!("agi-seek-{}", std::process::id()));
        let path = root.join("local-seek.json");
        let _ = std::fs::remove_dir_all(&root);
        let mut seek = Seek::new();
        seek.act("1", None, None).unwrap();
        seek.save(&path).unwrap();
        let loaded = Seek::load(&path).unwrap();
        assert_eq!(loaded.view()["level"], 1);
        assert_eq!(loaded.view()["actions"], 1);
        assert_eq!(loaded.view()["frame"][0][1], 1);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn level_three_walls_block_the_straight_path() {
        let mut seek = Seek::new();
        for action in ["1", "1", "3", "3", "1"] {
            seek.act(action, None, None).unwrap();
        }
        let view = seek.view();
        assert_eq!(view["level"], 3);
        assert_eq!(view["walls"], 3);
        assert_eq!(view["won"], false);
        assert_eq!(view["frame"][0][0], 1);
        assert_eq!(view["frame"][0][1], 4);
        assert!(view["score"].is_null());
        for action in ["3", "3", "1", "1", "1"] {
            seek.act(action, None, None).unwrap();
        }
        assert_eq!(seek.view()["won"], true);
        assert_eq!(seek.view()["ratio"], "6/5");
        assert!(seek.view()["score"].is_null());
        assert_eq!(seek.view()["level"], 3);
        assert!(seek.act("1", None, None).is_err());
    }
}
